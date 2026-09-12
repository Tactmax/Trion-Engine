import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Scene } from '../engine/core/Scene.ts'
import type { Entity } from '../engine/core/Entity.ts'
import type { TransformComponent } from '../engine/components/Transform.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { LightSystem } from '../engine/graphics/LightSystem.ts'
import type { AnimationSystem } from '../engine/systems/AnimationSystem.ts'
import type { EditorCamera } from './EditorCamera.ts'
import type { SelectionState } from './SelectionState.ts'
import { worldToLocal } from '../engine/components/Hierarchy.ts'
import { transformsEqual, type TransformData } from './EditorHistory.ts'
import {
  applyProxyDeltaToWorlds,
  computeSelectionPivot,
  snapshotGroupWorlds,
  snapshotLocalTransform,
  writeWorldsToLocals,
  type GroupDragSnapshot,
} from './multiTransform.ts'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface MultiTransformEntry {
  entityId: number
  before: TransformData | null
  after: TransformData | null
}

export interface GizmoControllerOptions {
  canvas: HTMLCanvasElement
  renderer: Renderer
  editorCamera: EditorCamera
  scene: Scene
  meshRendererSystem: MeshRendererSystem
  animationSystem?: AnimationSystem
  lightSystem?: LightSystem
  selectionState: SelectionState
  onTransformChanged?: (transform: TransformComponent) => void
  onTransformCommit?: (entityId: number, before: TransformData, after: TransformData) => void
  onMultiTransformCommit?: (entries: MultiTransformEntry[]) => void
  onModeChanged?: (mode: GizmoMode) => void
}

/**
 * Sensible starting gizmo mode for a light entity: directional lights are
 * about orientation, point/spot lights start with position. Returns null for
 * entities without a light component (ordinary Transform behavior applies).
 */
export function defaultGizmoModeForLight(entity: Entity): GizmoMode | null {
  if (entity.hasComponent('directionalLight')) return 'rotate'
  if (entity.hasComponent('pointLight')) return 'translate'
  if (entity.hasComponent('spotLight')) return 'translate'
  return null
}

/**
 * Wraps Three.js TransformControls to provide visual Move/Rotate/Scale gizmos.
 * The ECS TransformComponent remains the authoritative engine transform.
 * Light entities resolve to their runtime light object, so the same gizmo
 * drives light position/direction through the entity's Transform.
 */
export class GizmoController {
  private readonly renderer: Renderer
  private readonly editorCamera: EditorCamera
  private readonly scene: Scene
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly animationSystem?: AnimationSystem
  private readonly lightSystem?: LightSystem
  private readonly selectionState: SelectionState
  private readonly controls: TransformControls
  private readonly helper: THREE.Object3D
  private readonly onTransformChanged?: (transform: TransformComponent) => void
  private readonly onTransformCommit?: (entityId: number, before: TransformData, after: TransformData) => void
  private readonly onMultiTransformCommit?: (entries: MultiTransformEntry[]) => void
  private readonly onModeChanged?: (mode: GizmoMode) => void

  private currentTarget: THREE.Object3D | null = null
  private currentEntityId: number | null = null
  private currentEntityIds: number[] = []
  private dragStartTransform: TransformData | null = null
  private proxy: THREE.Group | null = null
  private multiDragStart: GroupDragSnapshot | null = null
  private multiDragLocals: Map<number, TransformData | null> | null = null
  private syncingProxy = false
  private readonly unsubscribe: () => void

  constructor(options: GizmoControllerOptions) {
    this.renderer = options.renderer
    this.editorCamera = options.editorCamera
    this.scene = options.scene
    this.meshRendererSystem = options.meshRendererSystem
    this.animationSystem = options.animationSystem
    this.lightSystem = options.lightSystem
    this.selectionState = options.selectionState
    this.onTransformChanged = options.onTransformChanged
    this.onTransformCommit = options.onTransformCommit
    this.onMultiTransformCommit = options.onMultiTransformCommit
    this.onModeChanged = options.onModeChanged

    this.controls = new TransformControls(this.editorCamera.camera, options.canvas)
    this.controls.setMode('translate')
    this.controls.setSize(0.85)

    this.helper = this.controls.getHelper()
    this.renderer.add(this.helper)

    this.controls.addEventListener('dragging-changed', (event: any) => {
      const isDragging = Boolean(event.value)
      this.editorCamera.setEnabled(!isDragging)
      this.editorCamera.setGizmoDragging(isDragging)

      if (isDragging) {
        this.beginDrag()
      } else {
        this.endDrag()
      }
    })

    this.controls.addEventListener('objectChange', () => {
      if (this.syncingProxy) return
      if (this.isMultiAttached()) {
        this.syncMultiToComponents()
        return
      }
      this.syncToComponent()
    })

    this.unsubscribe = this.selectionState.onChange((selectedId, selectedIds) => {
      this.attachToSelection(selectedId, selectedIds)
    })
  }

  setMode(mode: GizmoMode): void {
    this.controls.setMode(mode)
  }

  /** The runtime object the gizmo is currently driving, if any. */
  getTarget(): THREE.Object3D | null {
    return this.currentTarget
  }

  /** Entity the gizmo is currently driving, if any. */
  getEntityId(): number | null {
    return this.currentEntityId
  }

  /** All selected entities the gizmo is currently driving (one entry when single). */
  getSelectedIds(): number[] {
    return [...this.currentEntityIds]
  }

  getMode(): GizmoMode {
    return this.controls.getMode() as GizmoMode
  }

  /** True while hovering a gizmo handle or dragging. */
  isInteracting(): boolean {
    return this.controls.dragging || this.controls.axis !== null
  }

  isDragging(): boolean {
    return this.controls.dragging
  }

  /**
   * Attach gizmo to the entity's animation target, its mesh, or its runtime
   * light object (for light-only entities) otherwise. Multi-selections drive
   * a shared proxy at the group pivot instead.
   */
  attachToEntity(entityId: number | null): void {
    this.attachToSelection(entityId, entityId === null ? [] : [entityId])
  }

  attachToSelection(activeId: number | null, selectedIds?: number[]): void {
    const ids = (selectedIds ?? (activeId === null ? [] : [activeId])).filter((id) => this.scene.getEntity(id) !== undefined)
    if (ids.length === 0) {
      this.detach()
      return
    }
    if (ids.length === 1) {
      this.attachSingle(ids[0])
      return
    }
    const active = activeId !== null && ids.includes(activeId) ? activeId : ids[ids.length - 1]
    this.currentEntityId = active
    this.currentEntityIds = [...ids]
    this.dragStartTransform = null
    this.ensureProxy()
    this.positionProxyAtPivot()
    if (this.currentTarget !== this.proxy) {
      this.currentTarget = this.proxy
      this.controls.attach(this.proxy!)
    }
  }

  detach(): void {
    this.currentTarget = null
    this.currentEntityId = null
    this.currentEntityIds = []
    this.dragStartTransform = null
    this.multiDragStart = null
    this.multiDragLocals = null
    this.controls.detach()
    if (this.proxy) {
      this.renderer.remove(this.proxy)
    }
  }

  private attachSingle(entityId: number): void {
    this.currentEntityId = entityId
    this.currentEntityIds = [entityId]
    if (this.proxy) {
      this.renderer.remove(this.proxy)
    }

    const object = this.resolveSelectionObject(entityId)
    if (!object) {
      this.currentTarget = null
      this.currentEntityId = null
      this.currentEntityIds = []
      this.controls.detach()
      return
    }

    if (this.currentTarget !== object) {
      this.currentTarget = object
      this.controls.attach(object)
      this.applyLightDefaultMode(entityId, object)
    }
  }

  private isMultiAttached(): boolean {
    return this.currentEntityIds.length > 1 && this.currentTarget === this.proxy && this.proxy !== null
  }

  /**
   * Resolve the scene object representing an entity. Animated entities resolve
   * to their animation target; the renderer mesh underneath it carries identity
   * local transform and must not be driven directly. Light-only entities fall
   * back to their runtime light object, whose position/orientation mirrors the
   * entity's world transform through LightSystem.
   */
  private resolveSelectionObject(entityId: number): THREE.Object3D | null {
    const entity = this.scene.getEntity(entityId)
    if (!entity) return null

    if (entity.hasComponent('animation') && this.animationSystem) {
      const target = this.animationSystem.getTarget(entityId)
      if (target && target.parent) return target
    }

    const mesh = this.meshRendererSystem.getMesh(entityId)
    if (mesh && mesh.parent) return mesh

    const light = this.lightSystem?.getLight(entityId)
    if (light && light.parent) return light

    return null
  }

  /**
   * When the gizmo just attached to a light entity's runtime light object,
   * switch to that light type's sensible starting mode. Mesh-driven entities
   * keep whatever mode the user last chose.
   */
  private applyLightDefaultMode(entityId: number, object: THREE.Object3D): void {
    if (this.lightSystem?.getLight(entityId) !== object) return
    const entity = this.scene.getEntity(entityId)
    if (!entity) return
    const mode = defaultGizmoModeForLight(entity)
    if (mode && this.getMode() !== mode) {
      this.setMode(mode)
      this.onModeChanged?.(mode)
    }
  }

  /**
   * Copy the attached object's transform into the ECS TransformComponent.
   * The renderer scene stays flat so the object carries the world transform;
   * it is converted back to the entity's local transform here, keeping the
   * ECS TransformComponent authoritative for hierarchy composition.
   */
  private syncToComponent(): void {
    if (this.currentEntityId === null || !this.currentTarget) return

    const entity = this.scene.getEntity(this.currentEntityId)
    if (!entity) return

    const transform = entity.getComponent<TransformComponent>('transform')
    if (!transform) return

    const world = new THREE.Matrix4().compose(
      this.currentTarget.position.clone(),
      this.currentTarget.quaternion.clone(),
      this.currentTarget.scale.clone(),
    )
    const local = worldToLocal(this.scene, this.currentEntityId, world)

    transform.position.x = local.position.x
    transform.position.y = local.position.y
    transform.position.z = local.position.z

    transform.rotation.x = local.rotation.x
    transform.rotation.y = local.rotation.y
    transform.rotation.z = local.rotation.z

    transform.scale.x = local.scale.x
    transform.scale.y = local.scale.y
    transform.scale.z = local.scale.z

    this.onTransformChanged?.(transform)
  }

  private beginDrag(): void {
    if (this.isMultiAttached() && this.proxy) {
      this.multiDragStart = snapshotGroupWorlds(this.scene, this.currentEntityIds, this.proxy)
      const locals = new Map<number, TransformData | null>()
      for (const id of this.currentEntityIds) {
        locals.set(id, snapshotLocalTransform(this.scene, id))
      }
      this.multiDragLocals = locals
      return
    }
    if (this.currentEntityId !== null) {
      const entity = this.scene.getEntity(this.currentEntityId)
      const transform = entity?.getComponent<TransformComponent>('transform')
      if (transform) {
        this.dragStartTransform = {
          position: { ...transform.position },
          rotation: { ...transform.rotation },
          scale: { ...transform.scale },
        }
      }
    }
  }

  private endDrag(): void {
    if ((this.isMultiAttached() || this.multiDragStart !== null) && this.multiDragStart && this.multiDragLocals) {
      const entries: MultiTransformEntry[] = []
      for (const id of this.currentEntityIds) {
        const before = this.multiDragLocals.get(id) ?? null
        const after = snapshotLocalTransform(this.scene, id)
        if (before === null && after === null) continue
        if (before && after && transformsEqual(before, after)) continue
        entries.push({ entityId: id, before, after })
      }
      if (entries.length > 0) {
        this.onMultiTransformCommit?.(entries)
      }
      this.multiDragStart = null
      this.multiDragLocals = null
      return
    }
    this.multiDragStart = null
    this.multiDragLocals = null
    if (this.currentEntityId !== null && this.dragStartTransform) {
      const entity = this.scene.getEntity(this.currentEntityId)
      const transform = entity?.getComponent<TransformComponent>('transform')
      if (transform) {
        const endTransform: TransformData = {
          position: { ...transform.position },
          rotation: { ...transform.rotation },
          scale: { ...transform.scale },
        }
        if (!transformsEqual(this.dragStartTransform, endTransform)) {
          this.onTransformCommit?.(this.currentEntityId, this.dragStartTransform, endTransform)
        }
      }
    }
    this.dragStartTransform = null
  }

  /**
   * Drive every selected entity from the shared proxy. The proxy delta maps
   * each drag-start world matrix to its new world matrix, preserving relative
   * arrangement for translate, rotate and scale alike.
   */
  private syncMultiToComponents(): void {
    if (!this.multiDragStart || !this.proxy) return
    const worlds = applyProxyDeltaToWorlds(this.multiDragStart, this.proxy)
    writeWorldsToLocals(this.scene, worlds)
    if (this.currentEntityId !== null) {
      const active = this.scene.getEntity(this.currentEntityId)?.getComponent<TransformComponent>('transform')
      if (active) this.onTransformChanged?.(active)
    }
  }

  private ensureProxy(): void {
    if (!this.proxy) {
      this.proxy = new THREE.Group()
      this.proxy.name = 'TrionMultiSelectionProxy'
    }
    this.renderer.add(this.proxy)
  }

  private positionProxyAtPivot(): void {
    if (!this.proxy) return
    const pivot = computeSelectionPivot(this.scene, this.currentEntityIds)
    this.syncingProxy = true
    try {
      this.proxy.position.copy(pivot)
      this.proxy.quaternion.identity()
      this.proxy.scale.setScalar(1)
      this.proxy.updateMatrixWorld()
    } finally {
      this.syncingProxy = false
    }
  }

  update(): void {
    if (this.isMultiAttached()) {
      // Keep the pivot on the group while idle; never fight an active drag.
      if (this.controls.dragging) return
      const valid = this.currentEntityIds.filter((id) => this.scene.getEntity(id) !== undefined)
      if (valid.length <= 1) {
        if (valid.length === 1) {
          this.attachSingle(valid[0])
        } else {
          this.detach()
        }
        return
      }
      this.currentEntityIds = valid
      this.positionProxyAtPivot()
      return
    }
    // Re-resolve so animated entities keep tracking their animation target.
    if (this.currentEntityId !== null) {
      const object = this.resolveSelectionObject(this.currentEntityId)
      if (!object) {
        this.detach()
      } else if (object !== this.currentTarget) {
        this.currentTarget = object
        this.controls.attach(object)
      }
    }
  }

  dispose(): void {
    this.unsubscribe()
    this.detach()
    this.renderer.remove(this.helper)
    this.controls.dispose()
  }
}

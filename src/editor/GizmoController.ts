import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Scene } from '../engine/core/Scene.ts'
import type { TransformComponent } from '../engine/components/Transform.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { AnimationSystem } from '../engine/systems/AnimationSystem.ts'
import type { EditorCamera } from './EditorCamera.ts'
import type { SelectionState } from './SelectionState.ts'
import { transformsEqual, type TransformData } from './EditorHistory.ts'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface GizmoControllerOptions {
  canvas: HTMLCanvasElement
  renderer: Renderer
  editorCamera: EditorCamera
  scene: Scene
  meshRendererSystem: MeshRendererSystem
  animationSystem?: AnimationSystem
  selectionState: SelectionState
  onTransformChanged?: (transform: TransformComponent) => void
  onTransformCommit?: (entityId: number, before: TransformData, after: TransformData) => void
}

/**
 * Wraps Three.js TransformControls to provide visual Move/Rotate/Scale gizmos.
 * The ECS TransformComponent remains the authoritative engine transform.
 */
export class GizmoController {
  private readonly renderer: Renderer
  private readonly editorCamera: EditorCamera
  private readonly scene: Scene
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly animationSystem?: AnimationSystem
  private readonly selectionState: SelectionState
  private readonly controls: TransformControls
  private readonly helper: THREE.Object3D
  private readonly onTransformChanged?: (transform: TransformComponent) => void
  private readonly onTransformCommit?: (entityId: number, before: TransformData, after: TransformData) => void

  private currentTarget: THREE.Object3D | null = null
  private currentEntityId: number | null = null
  private dragStartTransform: TransformData | null = null
  private readonly unsubscribe: () => void

  constructor(options: GizmoControllerOptions) {
    this.renderer = options.renderer
    this.editorCamera = options.editorCamera
    this.scene = options.scene
    this.meshRendererSystem = options.meshRendererSystem
    this.animationSystem = options.animationSystem
    this.selectionState = options.selectionState
    this.onTransformChanged = options.onTransformChanged
    this.onTransformCommit = options.onTransformCommit

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
      } else {
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
    })

    this.controls.addEventListener('objectChange', () => {
      this.syncToComponent()
    })

    this.unsubscribe = this.selectionState.onChange((selectedId) => {
      this.attachToEntity(selectedId)
    })
  }

  setMode(mode: GizmoMode): void {
    this.controls.setMode(mode)
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

  /** Attach gizmo to the entity's animation target, or its mesh otherwise. */
  attachToEntity(entityId: number | null): void {
    this.currentEntityId = entityId

    if (entityId === null) {
      this.detach()
      return
    }

    const object = this.resolveSelectionObject(entityId)
    if (!object) {
      this.detach()
      return
    }

    if (this.currentTarget !== object) {
      this.currentTarget = object
      this.controls.attach(object)
    }
  }

  detach(): void {
    this.currentTarget = null
    this.currentEntityId = null
    this.controls.detach()
  }

  /**
   * Resolve the scene object representing an entity. Animated entities resolve
   * to their animation target; the renderer mesh underneath it carries identity
   * local transform and must not be driven directly.
   */
  private resolveSelectionObject(entityId: number): THREE.Object3D | null {
    const entity = this.scene.getEntity(entityId)
    if (!entity) return null

    if (entity.hasComponent('animation') && this.animationSystem) {
      const target = this.animationSystem.getTarget(entityId)
      if (target && target.parent) return target
    }

    const mesh = this.meshRendererSystem.getMesh(entityId)
    if (!mesh || !mesh.parent) return null
    return mesh
  }

  /** Copy the attached object's transform into the ECS TransformComponent. */
  private syncToComponent(): void {
    if (this.currentEntityId === null || !this.currentTarget) return

    const entity = this.scene.getEntity(this.currentEntityId)
    if (!entity) return

    const transform = entity.getComponent<TransformComponent>('transform')
    if (!transform) return

    transform.position.x = this.currentTarget.position.x
    transform.position.y = this.currentTarget.position.y
    transform.position.z = this.currentTarget.position.z

    transform.rotation.x = this.currentTarget.rotation.x
    transform.rotation.y = this.currentTarget.rotation.y
    transform.rotation.z = this.currentTarget.rotation.z

    transform.scale.x = this.currentTarget.scale.x
    transform.scale.y = this.currentTarget.scale.y
    transform.scale.z = this.currentTarget.scale.z

    this.onTransformChanged?.(transform)
  }

  update(): void {
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

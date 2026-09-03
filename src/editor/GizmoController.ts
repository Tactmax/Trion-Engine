import * as THREE from 'three'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Scene } from '../engine/core/Scene.ts'
import type { TransformComponent } from '../engine/components/Transform.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { EditorCamera } from './EditorCamera.ts'
import type { SelectionState } from './SelectionState.ts'

export type GizmoMode = 'translate' | 'rotate' | 'scale'

export interface GizmoControllerOptions {
  canvas: HTMLCanvasElement
  renderer: Renderer
  editorCamera: EditorCamera
  scene: Scene
  meshRendererSystem: MeshRendererSystem
  selectionState: SelectionState
  onTransformChanged?: (transform: TransformComponent) => void
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
  private readonly selectionState: SelectionState
  private readonly controls: TransformControls
  private readonly helper: THREE.Object3D
  private readonly onTransformChanged?: (transform: TransformComponent) => void

  private currentTarget: THREE.Object3D | null = null
  private currentEntityId: number | null = null
  private readonly unsubscribe: () => void

  constructor(options: GizmoControllerOptions) {
    this.renderer = options.renderer
    this.editorCamera = options.editorCamera
    this.scene = options.scene
    this.meshRendererSystem = options.meshRendererSystem
    this.selectionState = options.selectionState
    this.onTransformChanged = options.onTransformChanged

    this.controls = new TransformControls(this.editorCamera.camera, options.canvas)
    this.controls.setMode('translate')
    this.controls.setSize(0.85)

    this.helper = this.controls.getHelper()
    this.renderer.add(this.helper)

    // Disable camera orbit/pan during gizmo drag
    this.controls.addEventListener('dragging-changed', (event: any) => {
      const isDragging = Boolean(event.value)
      this.editorCamera.setEnabled(!isDragging)
    })

    // Authoritative sync: gizmo edit -> TransformComponent
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

  /**
   * Returns true if user is hovering over a gizmo handle or actively dragging.
   */
  isInteracting(): boolean {
    return this.controls.dragging || this.controls.axis !== null
  }

  isDragging(): boolean {
    return this.controls.dragging
  }

  /**
   * Attach gizmo to selected entity's mesh.
   */
  attachToEntity(entityId: number | null): void {
    this.currentEntityId = entityId

    if (entityId === null) {
      this.detach()
      return
    }

    const mesh = this.meshRendererSystem.getMesh(entityId)
    if (!mesh || !mesh.parent) {
      this.detach()
      return
    }

    if (this.currentTarget !== mesh) {
      this.currentTarget = mesh
      this.controls.attach(mesh)
    }
  }

  detach(): void {
    this.currentTarget = null
    this.currentEntityId = null
    this.controls.detach()
  }

  /**
   * Syncs the Three.js mesh's transform back into the ECS TransformComponent.
   */
  private syncToComponent(): void {
    if (this.currentEntityId === null || !this.currentTarget) return

    const entity = this.scene.getEntity(this.currentEntityId)
    if (!entity) return

    const transform = entity.getComponent<TransformComponent>('transform')
    if (!transform) return

    // Position: direct copy
    transform.position.x = this.currentTarget.position.x
    transform.position.y = this.currentTarget.position.y
    transform.position.z = this.currentTarget.position.z

    // Rotation: Euler XYZ radians (Trion convention matches Three.js Euler)
    transform.rotation.x = this.currentTarget.rotation.x
    transform.rotation.y = this.currentTarget.rotation.y
    transform.rotation.z = this.currentTarget.rotation.z

    // Scale: direct copy
    transform.scale.x = this.currentTarget.scale.x
    transform.scale.y = this.currentTarget.scale.y
    transform.scale.z = this.currentTarget.scale.z

    this.onTransformChanged?.(transform)
  }

  update(): void {
    // If attached entity was deleted, detach
    if (this.currentEntityId !== null) {
      const entity = this.scene.getEntity(this.currentEntityId)
      const mesh = this.meshRendererSystem.getMesh(this.currentEntityId)
      if (!entity || !mesh || !mesh.parent) {
        this.detach()
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

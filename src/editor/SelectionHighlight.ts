import * as THREE from 'three'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { AnimationSystem } from '../engine/systems/AnimationSystem.ts'
import type { SelectionState } from './SelectionState.ts'

/**
 * Editor-only visual selection box helper.
 * Highlights the currently selected entity's mesh without modifying its material or ECS data.
 */
export class SelectionHighlight {
  private readonly renderer: Renderer
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly selectionState: SelectionState
  private readonly animationSystem?: AnimationSystem

  private helper: THREE.BoxHelper | null = null
  private targetMesh: THREE.Object3D | null = null
  private readonly unsubscribe: () => void

  constructor(
    renderer: Renderer,
    meshRendererSystem: MeshRendererSystem,
    selectionState: SelectionState,
    animationSystem?: AnimationSystem,
  ) {
    this.renderer = renderer
    this.meshRendererSystem = meshRendererSystem
    this.selectionState = selectionState
    this.animationSystem = animationSystem

    this.unsubscribe = this.selectionState.onChange((selectedId) => {
      this.onSelectionChanged(selectedId)
    })
  }

  private onSelectionChanged(selectedId: number | null): void {
    this.removeHelper()

    if (selectedId === null) return

    const mesh = this.resolveSelectionObject(selectedId)
    if (!mesh) return

    this.targetMesh = mesh
    this.helper = new THREE.BoxHelper(mesh, 0x4f8fd3)
    this.helper.raycast = () => {}
    this.renderer.add(this.helper)
  }

  private resolveSelectionObject(entityId: number): THREE.Object3D | null {
    // A present target implies an animated entity; prefer it over the mesh.
    if (this.animationSystem) {
      const target = this.animationSystem.getTarget(entityId)
      if (target) return target.parent ? target : null
    }
    const mesh = this.meshRendererSystem.getMesh(entityId)
    if (!mesh || !mesh.parent) return null
    return mesh
  }

  update(): void {
    if (!this.helper || !this.targetMesh) return

    if (!this.targetMesh.parent) {
      this.removeHelper()
      return
    }

    this.helper.update()
  }

  setVisible(visible: boolean): void {
    if (this.helper) {
      this.helper.visible = visible
    }
  }

  private removeHelper(): void {
    if (this.helper) {
      this.renderer.remove(this.helper)
      this.helper.geometry.dispose()
      if (Array.isArray(this.helper.material)) {
        for (const mat of this.helper.material) mat.dispose()
      } else {
        this.helper.material.dispose()
      }
      this.helper = null
    }
    this.targetMesh = null
  }

  dispose(): void {
    this.unsubscribe()
    this.removeHelper()
  }
}

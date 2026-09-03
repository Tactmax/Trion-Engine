import * as THREE from 'three'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { SelectionState } from './SelectionState.ts'

/**
 * Editor-only visual selection box helper.
 * Highlights the currently selected entity's mesh without modifying its material or ECS data.
 */
export class SelectionHighlight {
  private readonly renderer: Renderer
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly selectionState: SelectionState

  private helper: THREE.BoxHelper | null = null
  private targetMesh: THREE.Object3D | null = null
  private readonly unsubscribe: () => void

  constructor(
    renderer: Renderer,
    meshRendererSystem: MeshRendererSystem,
    selectionState: SelectionState,
  ) {
    this.renderer = renderer
    this.meshRendererSystem = meshRendererSystem
    this.selectionState = selectionState

    this.unsubscribe = this.selectionState.onChange((selectedId) => {
      this.onSelectionChanged(selectedId)
    })
  }

  private onSelectionChanged(selectedId: number | null): void {
    this.removeHelper()

    if (selectedId === null) return

    const mesh = this.meshRendererSystem.getMesh(selectedId)
    if (!mesh) return

    this.targetMesh = mesh
    // Accent color matching the Trion editor theme (#4f8fd3)
    this.helper = new THREE.BoxHelper(mesh, 0x4f8fd3)
    // Make sure raycaster ignores the helper lines
    this.helper.raycast = () => {}
    this.renderer.add(this.helper)
  }

  update(): void {
    if (!this.helper || !this.targetMesh) return

    // If the target mesh was removed from the scene or no longer exists, remove helper
    if (!this.targetMesh.parent) {
      this.removeHelper()
      return
    }

    this.helper.update()
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

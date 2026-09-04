import * as THREE from 'three'
import type { Renderer } from '../engine/graphics/Renderer.ts'

/**
 * Editor-only visual ground grid.
 * Added directly to the Three.js scene via Renderer without touching ECS.
 */
export class EditorGrid {
  private readonly renderer: Renderer
  private readonly grid: THREE.GridHelper

  constructor(renderer: Renderer) {
    this.renderer = renderer
    this.grid = new THREE.GridHelper(20, 20, 0x555555, 0x2e353b)
    this.grid.position.y = 0
    this.renderer.add(this.grid)
  }

  setVisible(visible: boolean): void {
    this.grid.visible = visible
  }

  dispose(): void {
    this.renderer.remove(this.grid)
    this.grid.geometry.dispose()
    if (Array.isArray(this.grid.material)) {
      for (const mat of this.grid.material) mat.dispose()
    } else {
      this.grid.material.dispose()
    }
  }
}

import * as THREE from 'three'
import type { Renderer } from '../engine/graphics/Renderer.ts'

/**
 * Editor-only visual ground grid.
 * Added directly to the Three.js scene via Renderer without touching ECS.
 */
export class EditorGrid {
  private readonly renderer: Renderer
  private grid: THREE.GridHelper
  private size = 20
  private divisions = 20
  private opacity = 1

  constructor(renderer: Renderer) {
    this.renderer = renderer
    this.grid = new THREE.GridHelper(this.size, this.divisions, 0x555555, 0x2e353b)
    this.grid.position.y = 0
    this.applyOpacity()
    this.renderer.add(this.grid)
  }

  setVisible(visible: boolean): void {
    this.grid.visible = visible
  }

  isVisible(): boolean {
    return this.grid.visible
  }

  getSize(): number {
    return this.size
  }

  getDivisions(): number {
    return this.divisions
  }

  getOpacity(): number {
    return this.opacity
  }

  /** Rebuild the helper when extent or cell count changes. No-op when unchanged. */
  setSize(size: number, divisions: number): void {
    const nextSize = Number.isFinite(size) && size > 0 ? size : this.size
    const nextDivisions = Number.isFinite(divisions) && divisions >= 1 ? Math.round(divisions) : this.divisions
    if (nextSize === this.size && nextDivisions === this.divisions) return
    this.size = nextSize
    this.divisions = nextDivisions
    const visible = this.grid.visible
    this.renderer.remove(this.grid)
    this.grid.geometry.dispose()
    const material = this.grid.material as THREE.Material | THREE.Material[]
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose()
    } else {
      material.dispose()
    }
    this.grid = new THREE.GridHelper(this.size, this.divisions, 0x555555, 0x2e353b)
    this.grid.position.y = 0
    this.grid.visible = visible
    this.applyOpacity()
    this.renderer.add(this.grid)
  }

  setOpacity(opacity: number): void {
    const next = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : this.opacity
    if (next === this.opacity) return
    this.opacity = next
    this.applyOpacity()
  }

  private applyOpacity(): void {
    const material = this.grid.material as THREE.Material | THREE.Material[]
    const apply = (entry: THREE.Material): void => {
      entry.transparent = this.opacity < 1
      entry.opacity = this.opacity
    }
    if (Array.isArray(material)) {
      for (const entry of material) apply(entry)
    } else {
      apply(material)
    }
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

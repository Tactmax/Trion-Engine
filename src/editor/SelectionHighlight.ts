import * as THREE from 'three'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { AnimationSystem } from '../engine/systems/AnimationSystem.ts'
import type { SelectionState } from './SelectionState.ts'

interface HighlightEntry {
  helper: THREE.BoxHelper
  target: THREE.Object3D
}

/**
 * Editor-only visual selection box helpers.
 * Highlights every selected entity's mesh without modifying materials or ECS data.
 */
export class SelectionHighlight {
  private readonly renderer: Renderer
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly selectionState: SelectionState
  private readonly animationSystem?: AnimationSystem
  private isHidden?: (entityId: number) => boolean

  private readonly entries = new Map<number, HighlightEntry>()
  private visible = true
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

    this.unsubscribe = this.selectionState.onChange((_selectedId, selectedIds) => {
      this.onSelectionChanged(selectedIds ?? (_selectedId !== null ? [_selectedId] : []))
    })
  }

  private onSelectionChanged(selectedIds: number[]): void {
    this.removeHelpers()
    for (const id of selectedIds) {
      if (this.isHidden?.(id)) continue
      const mesh = this.resolveSelectionObject(id)
      if (!mesh) continue
      const helper = new THREE.BoxHelper(mesh, 0x4f8fd3)
      helper.raycast = () => {}
      helper.visible = this.visible
      this.renderer.add(helper)
      this.entries.set(id, { helper, target: mesh })
    }
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
    for (const [id, entry] of this.entries) {
      if (!entry.target.parent) {
        this.renderer.remove(entry.helper)
        entry.helper.geometry.dispose()
        disposeMaterial(entry.helper.material)
        this.entries.delete(id)
        continue
      }
      entry.helper.update()
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    for (const entry of this.entries.values()) {
      entry.helper.visible = visible
    }
  }

  setHiddenFilter(filter?: (entityId: number) => boolean): void {
    this.isHidden = filter
  }

  private removeHelpers(): void {
    for (const entry of this.entries.values()) {
      this.renderer.remove(entry.helper)
      entry.helper.geometry.dispose()
      disposeMaterial(entry.helper.material)
    }
    this.entries.clear()
  }

  dispose(): void {
    this.unsubscribe()
    this.removeHelpers()
  }
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const entry of material) entry.dispose()
  } else {
    material.dispose()
  }
}

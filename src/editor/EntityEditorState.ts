import type { Scene } from '../engine/core/Scene.ts'
import { getParentId } from '../engine/components/Hierarchy.ts'
import type { SelectionState } from './SelectionState.ts'

export interface EditorVisibilitySnapshot {
  hidden: number[]
  locked: number[]
}

/**
 * Editor-only visibility and locking state.
 */
export class EntityEditorState {
  private hidden = new Set<number>()
  private locked = new Set<number>()
  private readonly listeners = new Set<() => void>()
  private version = 0

  getVersion(): number {
    return this.version
  }

  isHidden(entityId: number): boolean {
    return this.hidden.has(entityId)
  }

  isLocked(entityId: number): boolean {
    return this.locked.has(entityId)
  }

  getHiddenIds(): number[] {
    return [...this.hidden]
  }

  getLockedIds(): number[] {
    return [...this.locked]
  }

  isEffectivelyHidden(scene: Scene, entityId: number): boolean {
    const seen = new Set<number>()
    let current: number | null = entityId
    while (current !== null && !seen.has(current)) {
      if (this.hidden.has(current)) return true
      seen.add(current)
      current = getParentId(scene, current)
    }
    return false
  }

  isPickable(scene: Scene, entityId: number): boolean {
    if (this.locked.has(entityId)) return false
    return !this.isEffectivelyHidden(scene, entityId)
  }

  canSelect(scene: Scene, entityId: number): boolean {
    if (!scene.getEntity(entityId)) return false
    return this.isPickable(scene, entityId)
  }

  canManipulate(scene: Scene, entityId: number): boolean {
    return this.canSelect(scene, entityId)
  }

  setHidden(entityId: number, hidden: boolean): boolean {
    const has = this.hidden.has(entityId)
    if (has === hidden) return false
    if (hidden) {
      this.hidden.add(entityId)
    } else {
      this.hidden.delete(entityId)
    }
    this.bump()
    return true
  }

  setLocked(entityId: number, locked: boolean): boolean {
    const has = this.locked.has(entityId)
    if (has === locked) return false
    if (locked) {
      this.locked.add(entityId)
    } else {
      this.locked.delete(entityId)
    }
    this.bump()
    return true
  }

  toggleHidden(entityId: number): boolean {
    const next = !this.hidden.has(entityId)
    this.setHidden(entityId, next)
    return next
  }

  toggleLocked(entityId: number): boolean {
    const next = !this.locked.has(entityId)
    this.setLocked(entityId, next)
    return next
  }

  hasEntity(entityId: number): boolean {
    return this.hidden.has(entityId) || this.locked.has(entityId)
  }

  removeEntity(entityId: number): boolean {
    const had = this.hidden.delete(entityId) || this.locked.delete(entityId)
    if (had) this.bump()
    return had
  }

  pruneStale(scene: Scene): boolean {
    let changed = false
    for (const id of [...this.hidden]) {
      if (!scene.getEntity(id)) {
        this.hidden.delete(id)
        changed = true
      }
    }
    for (const id of [...this.locked]) {
      if (!scene.getEntity(id)) {
        this.locked.delete(id)
        changed = true
      }
    }
    if (changed) this.bump()
    return changed
  }

  pruneSelection(selection: SelectionState, scene: Scene): number[] {
    const current = selection.getSelectedIds()
    if (current.length === 0) return current
    const next = current.filter((id) => this.canSelect(scene, id))
    if (next.length !== current.length) {
      const active = selection.getActiveId()
      const nextActive = active !== null && next.includes(active)
        ? active
        : (next.length > 0 ? next[next.length - 1] : null)
      selection.setSelection(next, nextActive)
    }
    return selection.getSelectedIds()
  }

  filterSelectable(scene: Scene, entityIds: number[]): number[] {
    return entityIds.filter((id) => this.canSelect(scene, id))
  }

  snapshot(): EditorVisibilitySnapshot {
    return { hidden: [...this.hidden], locked: [...this.locked] }
  }

  restore(snapshot: EditorVisibilitySnapshot): void {
    this.hidden = new Set(snapshot.hidden)
    this.locked = new Set(snapshot.locked)
    this.bump()
  }

  clear(): void {
    if (this.hidden.size === 0 && this.locked.size === 0) return
    this.hidden.clear()
    this.locked.clear()
    this.bump()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private bump(): void {
    this.version += 1
    for (const listener of this.listeners) {
      listener()
    }
  }
}

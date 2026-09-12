export type SelectionChangeListener = (selectedEntityId: number | null, selectedEntityIds?: number[]) => void

/**
 * Single source of truth for editor selection state.
 * Both hierarchy clicks and viewport raycast picks update this state.
 * Holds an ordered set of selected entity IDs plus an active entity
 * (the last-interacted selection member driving the Inspector and gizmo).
 * Single-selection consumers keep working through getSelectedId()/select().
 */
export class SelectionState {
  private selectedIds: number[] = []
  private activeId: number | null = null
  private readonly listeners = new Set<SelectionChangeListener>()

  getSelectedId(): number | null {
    return this.activeId
  }

  getActiveId(): number | null {
    return this.activeId
  }

  getSelectedIds(): number[] {
    return [...this.selectedIds]
  }

  getCount(): number {
    return this.selectedIds.length
  }

  isSelected(id: number): boolean {
    return this.selectedIds.includes(id)
  }

  select(id: number | null): void {
    if (id === null) {
      if (this.selectedIds.length === 0) return
      this.selectedIds = []
      this.activeId = null
      this.notify()
      return
    }
    if (this.selectedIds.length === 1 && this.selectedIds[0] === id && this.activeId === id) return
    this.selectedIds = [id]
    this.activeId = id
    this.notify()
  }

  setSelection(ids: number[], activeId?: number | null): void {
    const unique: number[] = []
    for (const id of ids) {
      if (!unique.includes(id)) unique.push(id)
    }
    const nextActive = activeId === undefined
      ? (unique.includes(this.activeId ?? -1) ? this.activeId : (unique.length > 0 ? unique[unique.length - 1] : null))
      : (activeId !== null && !unique.includes(activeId) ? (unique.length > 0 ? unique[unique.length - 1] : null) : activeId)
    if (arraysEqual(this.selectedIds, unique) && this.activeId === nextActive) return
    this.selectedIds = unique
    this.activeId = nextActive
    this.notify()
  }

  addToSelection(id: number): void {
    if (this.selectedIds.includes(id)) {
      if (this.activeId !== id) {
        this.activeId = id
        this.notify()
      }
      return
    }
    this.selectedIds = [...this.selectedIds, id]
    this.activeId = id
    this.notify()
  }

  removeFromSelection(id: number): void {
    if (!this.selectedIds.includes(id)) return
    const next = this.selectedIds.filter((entry) => entry !== id)
    this.selectedIds = next
    if (this.activeId === id) {
      this.activeId = next.length > 0 ? next[next.length - 1] : null
    }
    this.notify()
  }

  toggleSelection(id: number): void {
    if (this.selectedIds.includes(id)) {
      this.removeFromSelection(id)
    } else {
      this.addToSelection(id)
    }
  }

  setActive(id: number): void {
    if (!this.selectedIds.includes(id) || this.activeId === id) return
    this.activeId = id
    this.notify()
  }

  deselect(): void {
    this.select(null)
  }

  onChange(listener: SelectionChangeListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  clear(): void {
    this.select(null)
    this.listeners.clear()
  }

  private notify(): void {
    const snapshot = [...this.selectedIds]
    for (const listener of this.listeners) {
      listener(this.activeId, snapshot)
    }
  }
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

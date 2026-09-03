export type SelectionChangeListener = (selectedEntityId: number | null) => void

/**
 * Single source of truth for editor selection state.
 * Both hierarchy clicks and viewport raycast picks update this state.
 */
export class SelectionState {
  private selectedEntityId: number | null = null
  private readonly listeners = new Set<SelectionChangeListener>()

  getSelectedId(): number | null {
    return this.selectedEntityId
  }

  select(id: number | null): void {
    if (this.selectedEntityId === id) return
    this.selectedEntityId = id
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
    for (const listener of this.listeners) {
      listener(this.selectedEntityId)
    }
  }
}

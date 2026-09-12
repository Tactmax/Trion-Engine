import type { Entity } from '../engine/index.ts'

export interface HierarchySelectModifiers {
  ctrlKey: boolean
  shiftKey: boolean
}

export interface HierarchyPanelOptions {
  onSelectEntity: (entity: Entity, modifiers?: HierarchySelectModifiers) => void
  getParentId?: (entityId: number) => number | null
  onRenameEntity?: (entity: Entity, newName: string) => void
  onReparentEntity?: (childId: number, newParentId: number | null) => void
  onEmptyClick?: () => void
}

/** DOM-backed entity tree for the active scene. Roots render flat; children nest. */
export class HierarchyPanel {
  readonly element: HTMLElement
  private readonly list: HTMLUListElement
  private readonly options: HierarchyPanelOptions
  private lastEntities: Entity[] = []
  private lastSelectedId: number | null = null
  private lastSelectedIds: number[] = []
  private renamingId: number | null = null
  private cancelBlurCommit = false
  private dragId: number | null = null

  constructor(options: HierarchyPanelOptions) {
    this.options = options
    this.element = document.createElement('aside')
    this.element.className = 'trion-editor-panel trion-editor-hierarchy'
    const header = document.createElement('div')
    header.className = 'trion-editor-panel-header'
    const title = document.createElement('span')
    title.textContent = 'Hierarchy'
    const scene = document.createElement('span')
    scene.className = 'trion-editor-panel-context'
    scene.textContent = 'Scene'
    header.append(title, scene)
    this.list = document.createElement('ul')
    this.list.className = 'trion-editor-entity-list'
    this.list.addEventListener('dragover', (e) => this.onListDragOver(e))
    this.list.addEventListener('drop', (e) => this.onListDrop(e))
    this.list.addEventListener('click', (e) => {
      if (e.target === this.list) this.options.onEmptyClick?.()
    })
    this.element.append(header, this.list)
  }

  render(entities: Entity[], selectedEntityId: number | null, selectedEntityIds?: number[]): void {
    this.lastEntities = entities
    this.lastSelectedId = selectedEntityId
    this.lastSelectedIds = selectedEntityIds ?? (selectedEntityId !== null ? [selectedEntityId] : [])
    if (this.renamingId !== null && entities.some((entity) => entity.id === this.renamingId)) {
      this.syncSelectionClasses(this.lastSelectedIds)
      return
    }
    this.renamingId = null
    this.list.replaceChildren()
    for (const root of this.resolveRoots(entities)) {
      this.list.appendChild(this.createRow(root, entities, new Set(this.lastSelectedIds), new Set()))
    }
  }

  /** Flat display order (depth-first, roots then nested children). Used for shift range selection. */
  getDisplayOrder(): number[] {
    const order: number[] = []
    const visit = (entity: Entity, ancestors: Set<number>): void => {
      if (order.includes(entity.id) || ancestors.has(entity.id)) return
      order.push(entity.id)
      const next = new Set(ancestors)
      next.add(entity.id)
      for (const child of this.childrenOf(this.lastEntities, entity.id)) {
        visit(child, next)
      }
    }
    for (const root of this.resolveRoots(this.lastEntities)) {
      visit(root, new Set())
    }
    return order
  }

  /** Begin inline rename for an entity. No-op when already renaming it. */
  beginRename(entityId: number): void {
    if (this.renamingId === entityId) {
      this.focusRenameInput()
      return
    }
    if (!this.lastEntities.some((entity) => entity.id === entityId)) return
    this.renamingId = entityId
    this.cancelBlurCommit = false
    this.list.replaceChildren()
    for (const root of this.resolveRoots(this.lastEntities)) {
      this.list.appendChild(this.createRow(root, this.lastEntities, new Set(this.lastSelectedIds), new Set()))
    }
    this.focusRenameInput()
  }

  isRenaming(): boolean {
    return this.renamingId !== null
  }

  dispose(): void {
    this.element.remove()
  }

  private resolveRoots(entities: Entity[]): Entity[] {
    const ids = new Set(entities.map((entity) => entity.id))
    return entities.filter((entity) => {
      const parentId = this.readParent(entity.id)
      return parentId === null || !ids.has(parentId) || parentId === entity.id
    })
  }

  private childrenOf(entities: Entity[], parentId: number): Entity[] {
    return entities.filter((entity) => entity.id !== parentId && this.readParent(entity.id) === parentId)
  }

  private readParent(entityId: number): number | null {
    return this.options.getParentId?.(entityId) ?? null
  }

  private displayName(entity: Entity): string {
    return entity.name?.trim() || `Entity ${entity.id}`
  }

  private createRow(
    entity: Entity,
    entities: Entity[],
    selectedIds: Set<number>,
    ancestors: Set<number>,
  ): HTMLLIElement {
    const item = document.createElement('li')
    item.className = 'trion-editor-entity-item'
    item.dataset.entityId = String(entity.id)
    item.draggable = this.renamingId !== entity.id
    item.addEventListener('dragstart', (e) => this.onRowDragStart(e, entity.id))
    item.addEventListener('dragover', (e) => this.onRowDragOver(e, item, entity.id))
    item.addEventListener('dragleave', () => item.classList.remove('is-drop-target'))
    item.addEventListener('drop', (e) => this.onRowDrop(e, entity.id))
    item.addEventListener('dragend', () => this.clearDragState())

    if (this.renamingId === entity.id) {
      item.appendChild(this.createRenameInput(entity))
    } else {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-entity'
      button.textContent = this.displayName(entity)
      button.title = `Entity ID: ${entity.id}`
      button.classList.toggle('is-selected', selectedIds.has(entity.id))
      button.dataset.entityId = String(entity.id)
      button.addEventListener('click', (e) => this.options.onSelectEntity(entity, {
        ctrlKey: e.ctrlKey || e.metaKey,
        shiftKey: e.shiftKey,
      }))
      button.addEventListener('dblclick', () => {
        this.options.onSelectEntity(entity)
        this.beginRename(entity.id)
      })
      item.appendChild(button)
    }

    if (ancestors.has(entity.id)) return item
    const next = new Set(ancestors)
    next.add(entity.id)
    const children = this.childrenOf(entities, entity.id).filter((child) => !next.has(child.id))
    if (children.length > 0) {
      const nested = document.createElement('ul')
      nested.className = 'trion-editor-entity-list trion-editor-entity-children'
      for (const child of children) {
        nested.appendChild(this.createRow(child, entities, selectedIds, next))
      }
      item.appendChild(nested)
    }
    return item
  }

  private createRenameInput(entity: Entity): HTMLInputElement {
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'trion-editor-rename'
    input.setAttribute('aria-label', `Rename Entity ${entity.id}`)
    input.value = entity.name ?? ''
    input.addEventListener('click', (e) => e.stopPropagation())
    input.addEventListener('pointerdown', (e) => e.stopPropagation())
    input.addEventListener('dblclick', (e) => e.stopPropagation())
    input.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        e.preventDefault()
        this.commitRename(entity, true)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.cancelRename()
      }
    })
    input.addEventListener('blur', () => {
      if (this.cancelBlurCommit || this.renamingId !== entity.id) return
      this.commitRename(entity, false)
    })
    return input
  }

  private focusRenameInput(): void {
    const input = this.list.querySelector<HTMLInputElement>('.trion-editor-rename')
    if (!input) return
    input.focus()
    input.select()
  }

  private commitRename(entity: Entity, refocus: boolean): void {
    if (this.renamingId !== entity.id) return
    const input = this.list.querySelector<HTMLInputElement>('.trion-editor-rename')
    const newName = input ? input.value : (entity.name ?? '')
    this.renamingId = null
    this.options.onRenameEntity?.(entity, newName)
    this.render(this.lastEntities, this.lastSelectedId, this.lastSelectedIds)
    if (refocus) this.focusRowButton(entity.id)
  }

  private cancelRename(): void {
    if (this.renamingId === null) return
    const id = this.renamingId
    this.renamingId = null
    this.cancelBlurCommit = true
    this.render(this.lastEntities, this.lastSelectedId, this.lastSelectedIds)
    this.focusRowButton(id)
    queueMicrotask(() => {
      this.cancelBlurCommit = false
    })
  }

  private focusRowButton(entityId: number): void {
    const button = this.list.querySelector<HTMLButtonElement>(`button.trion-editor-entity[data-entity-id="${entityId}"]`)
    button?.focus()
  }

  private syncSelectionClasses(selectedIds: number[]): void {
    const selected = new Set(selectedIds.map((id) => String(id)))
    for (const button of this.list.querySelectorAll<HTMLButtonElement>('button.trion-editor-entity')) {
      button.classList.toggle('is-selected', selected.has(button.dataset.entityId ?? ''))
    }
  }

  private onRowDragStart(e: DragEvent, entityId: number): void {
    if (this.renamingId !== null) {
      e.preventDefault()
      return
    }
    this.dragId = entityId
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(entityId))
    }
  }

  private onRowDragOver(e: DragEvent, item: HTMLLIElement, entityId: number): void {
    if (this.dragId === null || this.dragId === entityId) return
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    item.classList.add('is-drop-target')
  }

  private onRowDrop(e: DragEvent, entityId: number): void {
    if (this.dragId === null || this.dragId === entityId) return
    e.preventDefault()
    e.stopPropagation()
    const childId = this.dragId
    this.clearDragState()
    this.options.onReparentEntity?.(childId, entityId)
  }

  private onListDragOver(e: DragEvent): void {
    if (this.dragId === null) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }

  private onListDrop(e: DragEvent): void {
    if (this.dragId === null) return
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-entity-id]')) return
    e.preventDefault()
    const childId = this.dragId
    this.clearDragState()
    this.options.onReparentEntity?.(childId, null)
  }

  private clearDragState(): void {
    this.dragId = null
    for (const row of this.list.querySelectorAll('.is-drop-target')) {
      row.classList.remove('is-drop-target')
    }
  }
}

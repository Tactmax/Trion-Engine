import type { Entity } from '../engine/index.ts'
import { filterHierarchyBySearch } from './groups.ts'

export interface HierarchySelectModifiers {
  ctrlKey: boolean
  shiftKey: boolean
}

export interface HierarchyPanelOptions {
  onSelectEntity: (entity: Entity, modifiers?: HierarchySelectModifiers) => void
  getParentId?: (entityId: number) => number | null
  onRenameEntity?: (entity: Entity, newName: string) => void
  onReparentEntity?: (childId: number, newParentId: number | null) => void
  onRenameRequest?: (entityId: number) => void
  onDuplicateSelected?: () => void
  onGroupIntoFolder?: () => void
  onUngroupSelected?: () => void
  onDeleteSelected?: () => void
  onEmptyClick?: () => void
  isHidden?: (entityId: number) => boolean
  isLocked?: (entityId: number) => boolean
  isEffectivelyHidden?: (entityId: number) => boolean
  onToggleVisibility?: (entityId: number) => void
  onToggleLock?: (entityId: number) => void
  isGroup?: (entity: Entity) => boolean
  onCreateEntity?: () => void
  onCreateGroup?: () => void
}

/** DOM-backed entity tree for the active scene. Roots render flat; children nest. */
export class HierarchyPanel {
  readonly element: HTMLElement
  private readonly list: HTMLUListElement
  private readonly searchInput: HTMLInputElement
  private readonly options: HierarchyPanelOptions
  private lastEntities: Entity[] = []
  private lastSelectedId: number | null = null
  private lastSelectedIds: number[] = []
  private renamingId: number | null = null
  private cancelBlurCommit = false
  private dragId: number | null = null
  private filter = ''
  private contextMenu: HTMLElement | null = null
  private contextMenuForId: number | null = null
  private contextMenuAbort: AbortController | null = null

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
    this.searchInput = document.createElement('input')
    this.searchInput.type = 'search'
    this.searchInput.className = 'trion-editor-hierarchy-search'
    this.searchInput.placeholder = 'Search...'
    this.searchInput.setAttribute('aria-label', 'Search hierarchy')
    this.searchInput.addEventListener('input', () => {
      this.setFilter(this.searchInput.value)
    })
    this.searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Escape' && this.searchInput.value.length > 0) {
        e.preventDefault()
        this.searchInput.value = ''
        this.setFilter('')
      }
    })
    this.searchInput.addEventListener('pointerdown', (e) => e.stopPropagation())
    this.searchInput.addEventListener('click', (e) => e.stopPropagation())
    this.searchInput.addEventListener('dblclick', (e) => e.stopPropagation())
    this.list = document.createElement('ul')
    this.list.className = 'trion-editor-entity-list'
    this.list.addEventListener('dragover', (e) => this.onListDragOver(e))
    this.list.addEventListener('dragleave', (e) => {
      // Only clear the root indicator when truly leaving the list, not when
      // moving between rows (relatedTarget stays inside the list).
      const next = e.relatedTarget as Node | null
      if (next && this.list.contains(next)) return
      this.list.classList.remove('is-root-drop-target')
    })
    this.list.addEventListener('drop', (e) => this.onListDrop(e))
    this.list.addEventListener('click', (e) => {
      if (e.target === this.list) this.options.onEmptyClick?.()
    })
    // The list already covers most of the panel, but header/search/footer gaps
    // are also natural root space. Treat any panel drop outside an entity row
    // as an unparent to root, reusing the same reparent path (null parent).
    this.element.addEventListener('dragover', (e) => this.onRootDragOver(e))
    this.element.addEventListener('drop', (e) => this.onRootDrop(e))
    const footer = document.createElement('div')
    footer.className = 'trion-editor-hierarchy-footer'
    const addEntityButton = document.createElement('button')
    addEntityButton.type = 'button'
    addEntityButton.className = 'trion-editor-button trion-editor-hierarchy-add'
    addEntityButton.textContent = '+ Entity'
    addEntityButton.title = 'Create an empty entity'
    addEntityButton.addEventListener('click', () => this.options.onCreateEntity?.())
    const addGroupButton = document.createElement('button')
    addGroupButton.type = 'button'
    addGroupButton.className = 'trion-editor-button trion-editor-hierarchy-add'
    addGroupButton.textContent = '+ Folder'
    addGroupButton.title = 'Create an empty folder'
    addGroupButton.addEventListener('click', () => this.options.onCreateGroup?.())
    footer.append(addEntityButton, addGroupButton)
    this.element.append(header, this.searchInput, this.list, footer)
  }

  /** Current search text. Empty means no filtering. */
  getFilter(): string {
    return this.filter
  }

  /** Set the hierarchy search filter (case-insensitive) and re-render. */
  setFilter(value: string): void {
    if (this.filter === value) return
    this.filter = value
    this.hideContextMenu()
    if (this.searchInput.value !== value) this.searchInput.value = value
    this.list.replaceChildren()
    for (const root of this.resolveRoots(this.getVisibleEntities())) {
      this.list.appendChild(this.createRow(root, this.getVisibleEntities(), new Set(this.lastSelectedIds), new Set()))
    }
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
    this.hideContextMenu()
    const visible = this.getVisibleEntities()
    this.list.replaceChildren()
    for (const root of this.resolveRoots(visible)) {
      this.list.appendChild(this.createRow(root, visible, new Set(this.lastSelectedIds), new Set()))
    }
  }

  /** Flat display order (depth-first, roots then nested children). Used for shift range selection. */
  getDisplayOrder(): number[] {
    const visible = this.getVisibleEntities()
    const order: number[] = []
    const visit = (entity: Entity, ancestors: Set<number>): void => {
      if (order.includes(entity.id) || ancestors.has(entity.id)) return
      order.push(entity.id)
      const next = new Set(ancestors)
      next.add(entity.id)
      for (const child of this.childrenOf(visible, entity.id)) {
        visit(child, next)
      }
    }
    for (const root of this.resolveRoots(visible)) {
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
    this.hideContextMenu()
    this.renamingId = entityId
    this.cancelBlurCommit = false
    const visible = this.getVisibleEntities()
    this.list.replaceChildren()
    for (const root of this.resolveRoots(visible)) {
      this.list.appendChild(this.createRow(root, visible, new Set(this.lastSelectedIds), new Set()))
    }
    this.focusRenameInput()
  }

  isRenaming(): boolean {
    return this.renamingId !== null
  }

  dispose(): void {
    this.hideContextMenu()
    this.element.remove()
  }

  private resolveRoots(entities: Entity[]): Entity[] {
    const ids = new Set(entities.map((entity) => entity.id))
    return entities.filter((entity) => {
      const parentId = this.readParent(entity.id)
      return parentId === null || !ids.has(parentId) || parentId === entity.id
    })
  }

  private getVisibleEntities(): Entity[] {
    if (this.filter.trim().length === 0) return this.lastEntities
    return filterHierarchyBySearch(this.lastEntities, this.filter, (id) => this.readParent(id))
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
    item.addEventListener('contextmenu', (e) => this.onRowContextMenu(e, entity))
    if (this.options.isHidden?.(entity.id)) item.classList.add('is-hidden')
    if (this.options.isLocked?.(entity.id)) item.classList.add('is-locked')
    if (this.options.isEffectivelyHidden?.(entity.id)) item.classList.add('is-effectively-hidden')
    const isGroup = this.options.isGroup?.(entity) ?? false
    if (isGroup) item.classList.add('is-group')

    if (this.renamingId === entity.id) {
      item.appendChild(this.createRenameInput(entity))
    } else {
      const row = document.createElement('div')
      row.className = 'trion-editor-entity-row'
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-entity'
      if (isGroup) button.classList.add('is-group')
      button.textContent = this.displayName(entity)
      button.title = isGroup ? `Folder ID: ${entity.id}` : `Entity ID: ${entity.id}`
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
      row.appendChild(button)
      const visibility = this.createVisibilityButton(entity)
      if (visibility) row.appendChild(visibility)
      const lock = this.createLockButton(entity)
      if (lock) row.appendChild(lock)
      item.appendChild(row)
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

  private createVisibilityButton(entity: Entity): HTMLButtonElement | null {
    if (!this.options.onToggleVisibility) return null
    const hidden = this.options.isHidden?.(entity.id) ?? false
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'trion-editor-entity-visibility'
    button.classList.toggle('is-hidden', hidden)
    button.textContent = hidden ? '○' : '◉'
    button.title = hidden ? `Show Entity ${entity.id}` : `Hide Entity ${entity.id}`
    button.setAttribute('aria-label', hidden ? `Show Entity ${entity.id}` : `Hide Entity ${entity.id}`)
    button.setAttribute('aria-pressed', String(hidden))
    button.dataset.entityId = String(entity.id)
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      this.options.onToggleVisibility?.(entity.id)
    })
    button.addEventListener('pointerdown', (e) => e.stopPropagation())
    button.addEventListener('dblclick', (e) => e.stopPropagation())
    return button
  }

  private createLockButton(entity: Entity): HTMLButtonElement | null {
    if (!this.options.onToggleLock) return null
    const locked = this.options.isLocked?.(entity.id) ?? false
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'trion-editor-entity-lock'
    button.classList.toggle('is-locked', locked)
    button.textContent = locked ? '▪' : '▫'
    button.title = locked ? `Unlock Entity ${entity.id}` : `Lock Entity ${entity.id}`
    button.setAttribute('aria-label', locked ? `Unlock Entity ${entity.id}` : `Lock Entity ${entity.id}`)
    button.setAttribute('aria-pressed', String(locked))
    button.dataset.entityId = String(entity.id)
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      this.options.onToggleLock?.(entity.id)
    })
    button.addEventListener('pointerdown', (e) => e.stopPropagation())
    button.addEventListener('dblclick', (e) => e.stopPropagation())
    return button
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
    this.hideContextMenu()
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
    const target = e.target as HTMLElement | null
    // Rows handle their own dragover (with stopPropagation); only the empty
    // list background counts as the root drop zone here.
    if (target?.closest('[data-entity-id]')) return
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    this.list.classList.add('is-root-drop-target')
  }

  private onListDrop(e: DragEvent): void {
    if (this.dragId === null) return
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-entity-id]')) return
    e.preventDefault()
    e.stopPropagation()
    const childId = this.dragId
    this.clearDragState()
    this.options.onReparentEntity?.(childId, null)
  }

  /**
   * Panel-level fallback so header/search/footer gaps behave like the empty
   * list background: dropping outside any entity row unparents to root.
   * Row and list drops stopPropagation, so this only fires for true gaps.
   */
  private onRootDragOver(e: DragEvent): void {
    if (this.dragId === null) return
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-entity-id]')) return
    if (target && this.list.contains(target) && target !== this.list) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    this.list.classList.add('is-root-drop-target')
  }

  private onRootDrop(e: DragEvent): void {
    if (this.dragId === null) return
    const target = e.target as HTMLElement | null
    if (target?.closest('[data-entity-id]')) return
    if (target && this.list.contains(target) && target !== this.list) return
    e.preventDefault()
    const childId = this.dragId
    this.clearDragState()
    this.options.onReparentEntity?.(childId, null)
  }

  private onRowContextMenu(e: MouseEvent, entity: Entity): void {
    if (this.renamingId !== null) return
    e.preventDefault()
    e.stopPropagation()
    // Right-clicking an unselected row isolates selection first, mirroring
    // plain left-click. Right-clicking inside a multi-selection keeps it so
    // bulk actions can operate on every selected root at once.
    if (!this.lastSelectedIds.includes(entity.id)) {
      this.options.onSelectEntity(entity)
    }
    this.showContextMenu(e.clientX, e.clientY, entity.id)
  }

  private showContextMenu(clientX: number, clientY: number, entityId: number): void {
    this.hideContextMenu()
    const selected = this.lastSelectedIds.includes(entityId) && this.lastSelectedIds.length > 0
      ? [...this.lastSelectedIds]
      : [entityId]
    // Disabled when everything targeted is already at the root.
    const hasParent = selected.some((id) => this.readParent(id) !== null)
    const hasFolder = selected.some((id) => {
      const entity = this.lastEntities.find((candidate) => candidate.id === id)
      return entity !== undefined && (this.options.isGroup?.(entity) ?? false)
    })
    const menu = document.createElement('div')
    menu.className = 'trion-editor-menu-panel trion-editor-hierarchy-context'
    menu.setAttribute('role', 'menu')
    const appendItem = (
      label: string,
      shortcut: string | null,
      title: string,
      disabled: boolean,
      onClick: () => void,
    ): HTMLButtonElement => {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'trion-editor-menu-item'
      const labelEl = document.createElement('span')
      labelEl.textContent = label
      item.appendChild(labelEl)
      if (shortcut) {
        const hint = document.createElement('span')
        hint.className = 'trion-editor-menu-shortcut'
        hint.textContent = shortcut
        item.appendChild(hint)
      }
      item.title = title
      item.disabled = disabled
      item.setAttribute('role', 'menuitem')
      item.addEventListener('click', onClick)
      menu.appendChild(item)
      return item
    }
    // Mirror the Modify Selected menu so right-click offers the same actions.
    const renameItem = appendItem('Rename…', 'F2', 'Rename (F2)', false, () => {
      const target = this.contextMenuForId
      this.hideContextMenu()
      if (target === null) return
      this.options.onRenameRequest?.(target)
    })
    appendItem('Duplicate Selected', 'Ctrl+D', 'Duplicate Selected (Ctrl+D)', false, () => {
      this.hideContextMenu()
      this.options.onDuplicateSelected?.()
    })
    appendItem('Group into Folder', 'Ctrl+G', 'Group Selected into a New Folder (Ctrl+G)', false, () => {
      this.hideContextMenu()
      this.options.onGroupIntoFolder?.()
    })
    appendItem(
      'Ungroup',
      null,
      hasFolder ? 'Move folder contents out and delete the empty folder' : 'Select a folder to ungroup',
      !hasFolder,
      () => {
        this.hideContextMenu()
        this.options.onUngroupSelected?.()
      },
    )
    appendItem('Delete Selected', null, 'Delete Selected', false, () => {
      this.hideContextMenu()
      this.options.onDeleteSelected?.()
    })
    const unparentItem = appendItem(
      selected.length > 1 ? `Unparent ${selected.length} entities` : 'Unparent',
      null,
      hasParent ? 'Move to root, preserving world transform' : 'Already at the root level',
      !hasParent,
      () => {
        const target = this.contextMenuForId
        this.hideContextMenu()
        if (target === null || unparentItem.disabled) return
        // Reuse the standard reparent path with a null parent: world-transform
        // preservation, multi-selection roots and single undo entry are all
        // handled downstream by reparentSelection.
        this.options.onReparentEntity?.(target, null)
      },
    )
    this.contextMenu = menu
    this.contextMenuForId = entityId
    document.body.appendChild(menu)
    const rect = menu.getBoundingClientRect()
    menu.style.left = `${Math.max(4, Math.min(clientX, window.innerWidth - rect.width - 4))}px`
    menu.style.top = `${Math.max(4, Math.min(clientY, window.innerHeight - rect.height - 4))}px`
    const onPointerDown = (down: PointerEvent): void => {
      if (menu.contains(down.target as Node | null)) return
      this.hideContextMenu()
    }
    const onKeyDown = (key: KeyboardEvent): void => {
      if (key.key === 'Escape') this.hideContextMenu()
    }
    const onScroll = (): void => this.hideContextMenu()
    // Listeners are one-shot: hideContextMenu removes them via AbortController.
    this.contextMenuAbort?.abort()
    this.contextMenuAbort = new AbortController()
    const { signal } = this.contextMenuAbort
    document.addEventListener('pointerdown', onPointerDown, { signal })
    document.addEventListener('keydown', onKeyDown, { signal })
    window.addEventListener('blur', onScroll, { signal })
    renameItem.focus()
  }

  private hideContextMenu(): void {
    this.contextMenuAbort?.abort()
    this.contextMenuAbort = null
    this.contextMenu?.remove()
    this.contextMenu = null
    this.contextMenuForId = null
  }

  private clearDragState(): void {
    this.dragId = null
    this.list.classList.remove('is-root-drop-target')
    for (const row of this.list.querySelectorAll('.is-drop-target')) {
      row.classList.remove('is-drop-target')
    }
  }
}

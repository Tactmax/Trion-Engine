import type { Entity, Scene, SceneManager } from '../engine/index.ts'
import { HierarchyPanel } from './HierarchyPanel.ts'
import { InspectorPanel } from './InspectorPanel.ts'

/**
 * Browser editor shell that consumes the public scene model without changing it.
 * Call update() from the host application's existing frame lifecycle.
 */
export class Editor {
  private readonly sceneManager: SceneManager
  private readonly root: HTMLElement
  private readonly hierarchy: HierarchyPanel
  private readonly inspector: InspectorPanel
  private readonly deleteButton: HTMLButtonElement
  private readonly status: HTMLElement
  private activeScene: Scene | null = null
  private selectedEntityId: number | null = null
  private hierarchySignature = ''

  constructor(sceneManager: SceneManager, canvas: HTMLCanvasElement) {
    this.sceneManager = sceneManager
    this.root = document.createElement('div')
    this.root.className = 'trion-editor'
    this.hierarchy = new HierarchyPanel({
      onSelectEntity: (entity) => this.selectEntity(entity),
    })
    this.inspector = new InspectorPanel()

    const titlebar = document.createElement('header')
    titlebar.className = 'trion-editor-titlebar'
    const brand = document.createElement('div')
    brand.className = 'trion-editor-brand'
    brand.innerHTML = '<span class="trion-editor-brand-mark" aria-hidden="true"></span>Trion <span>Editor</span>'
    const sceneTitle = document.createElement('div')
    sceneTitle.className = 'trion-editor-scene-title'
    sceneTitle.textContent = 'Untitled Scene'
    const titlebarMeta = document.createElement('div')
    titlebarMeta.className = 'trion-editor-titlebar-meta'
    titlebarMeta.textContent = 'WebGL'
    titlebar.append(brand, sceneTitle, titlebarMeta)

    const toolbar = document.createElement('div')
    toolbar.className = 'trion-editor-toolbar'
    this.status = document.createElement('div')
    this.status.className = 'trion-editor-status'
    const toolbarActions = document.createElement('div')
    toolbarActions.className = 'trion-editor-toolbar-actions'
    const createButton = document.createElement('button')
    createButton.type = 'button'
    createButton.className = 'trion-editor-button is-primary'
    createButton.textContent = 'Create Entity'
    createButton.addEventListener('click', () => this.createEntity())
    this.deleteButton = document.createElement('button')
    this.deleteButton.type = 'button'
    this.deleteButton.className = 'trion-editor-button'
    this.deleteButton.textContent = 'Delete Selected'
    this.deleteButton.addEventListener('click', () => this.deleteSelectedEntity())
    toolbarActions.append(createButton, this.deleteButton)
    toolbar.append(this.status, toolbarActions)
    const viewport = document.createElement('main')
    viewport.className = 'trion-editor-viewport'
    const viewportToolbar = document.createElement('div')
    viewportToolbar.className = 'trion-editor-viewport-toolbar'
    const sceneTab = document.createElement('span')
    sceneTab.className = 'trion-editor-viewport-tab is-active'
    sceneTab.textContent = 'Scene'
    const viewMode = document.createElement('span')
    viewMode.className = 'trion-editor-viewport-mode'
    viewMode.textContent = 'Perspective'
    viewportToolbar.append(sceneTab, viewMode)
    viewport.append(viewportToolbar, canvas)

    const statusbar = document.createElement('footer')
    statusbar.className = 'trion-editor-statusbar'
    const statusbarLabel = document.createElement('span')
    statusbarLabel.textContent = 'Trion Engine'
    const statusbarHint = document.createElement('span')
    statusbarHint.textContent = 'Hierarchy selection • Transform inspector'
    statusbar.append(statusbarLabel, statusbarHint)

    this.root.append(titlebar, toolbar, this.hierarchy.element, viewport, this.inspector.element, statusbar)
    document.body.appendChild(this.root)
    this.update()
  }

  /** Refreshes scene-derived editor state. It does not create a frame loop. */
  update(): void {
    const scene = this.sceneManager.getActiveScene()
    const entities = scene.getAllEntities()
    if (scene !== this.activeScene) {
      this.activeScene = scene
      this.selectedEntityId = null
      this.hierarchySignature = ''
      this.inspector.render(null)
    }
    if (this.selectedEntityId !== null && !scene.getEntity(this.selectedEntityId)) {
      this.selectedEntityId = null
      this.inspector.render(null)
    }
    const signature = entities.map((entity) => `${entity.id}:${entity.name ?? ''}`).join('|')
    if (signature !== this.hierarchySignature) {
      this.hierarchySignature = signature
      this.hierarchy.render(entities, this.selectedEntityId)
    }
    this.deleteButton.disabled = this.selectedEntityId === null
    this.status.textContent = `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`
  }

  dispose(): void {
    this.hierarchy.dispose()
    this.inspector.dispose()
    this.root.remove()
  }

  private selectEntity(entity: Entity): void {
    this.selectedEntityId = entity.id
    this.hierarchySignature = ''
    this.hierarchy.render(this.activeScene?.getAllEntities() ?? [], this.selectedEntityId)
    this.inspector.render(entity)
    this.deleteButton.disabled = false
  }

  private createEntity(): void {
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.createEntity()
    entity.name = `Entity ${entity.id}`
    this.selectEntity(entity)
  }

  private deleteSelectedEntity(): void {
    if (this.selectedEntityId === null) return
    this.sceneManager.getActiveScene().destroyEntity(this.selectedEntityId)
    this.selectedEntityId = null
    this.inspector.render(null)
    this.deleteButton.disabled = true
    this.hierarchySignature = ''
    this.update()
  }
}

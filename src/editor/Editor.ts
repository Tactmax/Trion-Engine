import type * as THREE from 'three'
import type { Scene, SceneManager } from '../engine/index.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import { HierarchyPanel } from './HierarchyPanel.ts'
import { InspectorPanel } from './InspectorPanel.ts'
import { SelectionState } from './SelectionState.ts'
import { EditorCamera } from './EditorCamera.ts'
import { EditorGrid } from './EditorGrid.ts'
import { EntityPicker } from './EntityPicker.ts'
import { SelectionHighlight } from './SelectionHighlight.ts'
import { GizmoController, type GizmoMode } from './GizmoController.ts'

/**
 * Browser editor shell that consumes the public scene model without changing it.
 * Manages viewport navigation, entity picking, transform gizmos, and selection synchronization.
 * Call update() from the host application's existing frame lifecycle.
 */
export class Editor {
  private readonly sceneManager: SceneManager
  private readonly root: HTMLElement
  private readonly hierarchy: HierarchyPanel
  private readonly inspector: InspectorPanel
  private readonly deleteButton: HTMLButtonElement
  private readonly status: HTMLElement

  // Editor-only state & subsystems
  private readonly selectionState: SelectionState
  private readonly editorCamera: EditorCamera
  private readonly grid: EditorGrid
  private readonly gizmo: GizmoController
  private readonly selectionHighlight: SelectionHighlight
  private readonly picker: EntityPicker

  private activeScene: Scene | null = null
  private selectedEntityId: number | null = null
  private hierarchySignature = ''
  private editorViewActive = true

  private readonly modeButtons = new Map<GizmoMode, HTMLButtonElement>()
  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly unsubscribeSelection: () => void

  constructor(
    sceneManager: SceneManager,
    canvas: HTMLCanvasElement,
    renderer: Renderer,
    meshRendererSystem: MeshRendererSystem,
  ) {
    this.sceneManager = sceneManager

    this.selectionState = new SelectionState()
    this.editorCamera = new EditorCamera(canvas)
    this.grid = new EditorGrid(renderer)

    this.hierarchy = new HierarchyPanel({
      onSelectEntity: (entity) => this.selectionState.select(entity.id),
    })
    this.inspector = new InspectorPanel()

    this.gizmo = new GizmoController({
      canvas,
      renderer,
      editorCamera: this.editorCamera,
      scene: this.sceneManager.getActiveScene(),
      meshRendererSystem,
      selectionState: this.selectionState,
      onTransformChanged: (transform) => {
        this.inspector.syncValues(transform)
      },
    })

    this.selectionHighlight = new SelectionHighlight(
      renderer,
      meshRendererSystem,
      this.selectionState,
    )

    this.picker = new EntityPicker({
      canvas,
      camera: this.editorCamera.camera,
      getScene: () => this.sceneManager.getActiveScene(),
      meshRendererSystem,
      selectionState: this.selectionState,
      isGizmoInteracting: () => this.gizmo.isInteracting(),
    })

    // DOM UI Setup
    this.root = document.createElement('div')
    this.root.className = 'trion-editor'

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
    this.deleteButton.disabled = true
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

    // Gizmo tools buttons (W / E / R)
    const gizmoTools = document.createElement('div')
    gizmoTools.className = 'trion-editor-gizmo-tools'

    const modes: Array<{ mode: GizmoMode; label: string; shortcut: string }> = [
      { mode: 'translate', label: 'Move', shortcut: 'W' },
      { mode: 'rotate', label: 'Rotate', shortcut: 'E' },
      { mode: 'scale', label: 'Scale', shortcut: 'R' },
    ]

    for (const { mode, label, shortcut } of modes) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'trion-editor-gizmo-btn'
      if (mode === 'translate') btn.classList.add('is-active')
      btn.textContent = `${label} (${shortcut})`
      btn.title = `${label} [${shortcut}]`
      btn.addEventListener('click', () => this.setGizmoMode(mode))
      this.modeButtons.set(mode, btn)
      gizmoTools.appendChild(btn)
    }

    const viewMode = document.createElement('span')
    viewMode.className = 'trion-editor-viewport-mode'
    viewMode.textContent = 'Perspective'

    viewportToolbar.append(sceneTab, gizmoTools, viewMode)
    viewport.append(viewportToolbar, canvas)

    const statusbar = document.createElement('footer')
    statusbar.className = 'trion-editor-statusbar'
    const statusbarLabel = document.createElement('span')
    statusbarLabel.textContent = 'Trion Engine'
    const statusbarHint = document.createElement('span')
    statusbarHint.textContent = 'R-drag Orbit • M-drag Pan • Wheel Zoom • W/E/R Gizmos'
    statusbar.append(statusbarLabel, statusbarHint)

    this.root.append(titlebar, toolbar, this.hierarchy.element, viewport, this.inspector.element, statusbar)
    document.body.appendChild(this.root)

    // Selection synchronization listener
    this.unsubscribeSelection = this.selectionState.onChange((selectedId) => {
      this.selectedEntityId = selectedId
      const scene = this.sceneManager.getActiveScene()
      const entity = selectedId !== null ? scene.getEntity(selectedId) ?? null : null

      this.hierarchy.render(scene.getAllEntities(), selectedId)
      this.inspector.render(entity)
      this.deleteButton.disabled = selectedId === null
    })

    // Keyboard shortcuts: W = translate, E = rotate, R = scale
    this.onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }
      if (e.code === 'KeyW') {
        this.setGizmoMode('translate')
        e.stopPropagation()
      } else if (e.code === 'KeyE') {
        this.setGizmoMode('rotate')
        e.stopPropagation()
      } else if (e.code === 'KeyR') {
        this.setGizmoMode('scale')
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', this.onKeyDown)

    this.update()
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmo.setMode(mode)
    for (const [m, btn] of this.modeButtons.entries()) {
      btn.classList.toggle('is-active', m === mode)
    }
  }

  /** Exposes the editor camera for the editor rendering path. */
  getCamera(): THREE.PerspectiveCamera {
    return this.editorCamera.camera
  }

  /** Whether the editor viewport rendering path is active. */
  isEditorViewActive(): boolean {
    return this.editorViewActive
  }

  setEditorViewActive(active: boolean): void {
    this.editorViewActive = active
  }

  getSelectionState(): SelectionState {
    return this.selectionState
  }

  /** Refreshes scene-derived editor state and updates camera/helpers. */
  update(): void {
    const scene = this.sceneManager.getActiveScene()
    const entities = scene.getAllEntities()

    if (scene !== this.activeScene) {
      this.activeScene = scene
      this.selectionState.select(null)
      this.hierarchySignature = ''
    }

    // Clear selection if selected entity disappeared (deleted elsewhere or scene cleared)
    if (this.selectedEntityId !== null && !scene.getEntity(this.selectedEntityId)) {
      this.selectionState.select(null)
    }

    const signature = entities.map((entity) => `${entity.id}:${entity.name ?? ''}`).join('|')
    if (signature !== this.hierarchySignature) {
      this.hierarchySignature = signature
      this.hierarchy.render(entities, this.selectedEntityId)
    }

    this.deleteButton.disabled = this.selectedEntityId === null
    this.status.textContent = `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`

    // Update editor viewport subsystems
    this.editorCamera.update()
    this.selectionHighlight.update()
    this.gizmo.update()
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    this.unsubscribeSelection()
    this.picker.dispose()
    this.gizmo.dispose()
    this.selectionHighlight.dispose()
    this.grid.dispose()
    this.editorCamera.dispose()
    this.selectionState.clear()
    this.hierarchy.dispose()
    this.inspector.dispose()
    this.root.remove()
  }

  private createEntity(): void {
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.createEntity()
    entity.name = `Entity ${entity.id}`
    this.selectionState.select(entity.id)
  }

  private deleteSelectedEntity(): void {
    if (this.selectedEntityId === null) return
    const idToDelete = this.selectedEntityId
    this.selectionState.select(null)
    this.sceneManager.getActiveScene().destroyEntity(idToDelete)
    this.hierarchySignature = ''
    this.update()
  }
}

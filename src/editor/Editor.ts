import type * as THREE from 'three'
import type { Component, Entity, EntityMetadata, Scene, SceneData, SceneManager } from '../engine/index.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { AnimationSystem } from '../engine/systems/AnimationSystem.ts'
import type { TransformComponent } from '../engine/components/Transform.ts'
import { HierarchyPanel } from './HierarchyPanel.ts'
import { InspectorPanel } from './InspectorPanel.ts'
import { SelectionState } from './SelectionState.ts'
import { EditorCamera } from './EditorCamera.ts'
import { EditorGrid } from './EditorGrid.ts'
import { EntityPicker } from './EntityPicker.ts'
import { SelectionHighlight } from './SelectionHighlight.ts'
import { GizmoController, type GizmoMode } from './GizmoController.ts'
import { cloneComponent, EditorHistory, type TransformData } from './EditorHistory.ts'

interface PrePlaySnapshot {
  sceneData: SceneData
  entitySnapshot: Map<number, { metadata: EntityMetadata; components: Component[] }>
  selectedEntityId: number | null
}

/**
 * Browser editor shell for viewport navigation, picking, transform gizmos,
 * selection, undo/redo history, and play mode.
 * Call update() from the host application's existing frame lifecycle.
 */
export class Editor {
  private readonly sceneManager: SceneManager
  private readonly root: HTMLElement
  private readonly hierarchy: HierarchyPanel
  private readonly inspector: InspectorPanel
  private readonly createButton: HTMLButtonElement
  private readonly deleteButton: HTMLButtonElement
  private readonly undoButton: HTMLButtonElement
  private readonly redoButton: HTMLButtonElement
  private readonly playButton: HTMLButtonElement
  private readonly stopButton: HTMLButtonElement
  private readonly status: HTMLElement
  private readonly titlebarMeta: HTMLElement

  private readonly history: EditorHistory
  private readonly meshRendererSystem: MeshRendererSystem
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
  private playing = false
  private prePlaySnapshot: PrePlaySnapshot | null = null

  private readonly modeButtons = new Map<GizmoMode, HTMLButtonElement>()
  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly unsubscribeSelection: () => void

  constructor(
    sceneManager: SceneManager,
    canvas: HTMLCanvasElement,
    renderer: Renderer,
    meshRendererSystem: MeshRendererSystem,
    animationSystem?: AnimationSystem,
  ) {
    this.sceneManager = sceneManager
    this.meshRendererSystem = meshRendererSystem

    this.history = new EditorHistory(50, () => {
      this.updateHistoryButtons()
    })

    this.selectionState = new SelectionState()
    this.editorCamera = new EditorCamera(canvas)
    this.grid = new EditorGrid(renderer)

    this.hierarchy = new HierarchyPanel({
      onSelectEntity: (entity) => {
        if (!this.playing) {
          this.selectionState.select(entity.id)
        }
      },
    })

    this.inspector = new InspectorPanel({
      onTransformCommit: (entityId, before, after) => {
        this.recordTransformChange(entityId, before, after)
      },
    })

    this.gizmo = new GizmoController({
      canvas,
      renderer,
      editorCamera: this.editorCamera,
      scene: this.sceneManager.getActiveScene(),
      meshRendererSystem,
      animationSystem,
      selectionState: this.selectionState,
      onTransformChanged: (transform) => {
        this.inspector.syncValues(transform)
      },
      onTransformCommit: (entityId, before, after) => {
        this.recordTransformChange(entityId, before, after)
      },
    })

    this.selectionHighlight = new SelectionHighlight(
      renderer,
      meshRendererSystem,
      this.selectionState,
      animationSystem,
    )

    this.picker = new EntityPicker({
      canvas,
      camera: this.editorCamera.camera,
      getScene: () => this.sceneManager.getActiveScene(),
      meshRendererSystem,
      animationSystem,
      selectionState: this.selectionState,
      isGizmoInteracting: () => this.gizmo.isInteracting(),
    })

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
    this.titlebarMeta = document.createElement('div')
    this.titlebarMeta.className = 'trion-editor-titlebar-meta'
    this.titlebarMeta.textContent = 'WebGL'
    titlebar.append(brand, sceneTitle, this.titlebarMeta)

    const toolbar = document.createElement('div')
    toolbar.className = 'trion-editor-toolbar'
    this.status = document.createElement('div')
    this.status.className = 'trion-editor-status'
    const toolbarActions = document.createElement('div')
    toolbarActions.className = 'trion-editor-toolbar-actions'

    this.undoButton = document.createElement('button')
    this.undoButton.type = 'button'
    this.undoButton.className = 'trion-editor-button'
    this.undoButton.textContent = 'Undo'
    this.undoButton.title = 'Undo (Ctrl+Z)'
    this.undoButton.disabled = true
    this.undoButton.addEventListener('click', () => this.undo())

    this.redoButton = document.createElement('button')
    this.redoButton.type = 'button'
    this.redoButton.className = 'trion-editor-button'
    this.redoButton.textContent = 'Redo'
    this.redoButton.title = 'Redo (Ctrl+Y)'
    this.redoButton.disabled = true
    this.redoButton.addEventListener('click', () => this.redo())

    this.createButton = document.createElement('button')
    this.createButton.type = 'button'
    this.createButton.className = 'trion-editor-button is-primary'
    this.createButton.textContent = 'Create Entity'
    this.createButton.addEventListener('click', () => this.createEntity())

    this.deleteButton = document.createElement('button')
    this.deleteButton.type = 'button'
    this.deleteButton.className = 'trion-editor-button'
    this.deleteButton.textContent = 'Delete Selected'
    this.deleteButton.disabled = true
    this.deleteButton.addEventListener('click', () => this.deleteSelectedEntity())

    this.playButton = document.createElement('button')
    this.playButton.type = 'button'
    this.playButton.className = 'trion-editor-button is-play'
    this.playButton.textContent = '▶ Play'
    this.playButton.title = 'Play (F5)'
    this.playButton.addEventListener('click', () => this.play())

    this.stopButton = document.createElement('button')
    this.stopButton.type = 'button'
    this.stopButton.className = 'trion-editor-button is-stop'
    this.stopButton.textContent = '⏹ Stop'
    this.stopButton.title = 'Stop (F8)'
    this.stopButton.disabled = true
    this.stopButton.addEventListener('click', () => this.stop())

    toolbarActions.append(
      this.undoButton,
      this.redoButton,
      this.createButton,
      this.deleteButton,
      this.playButton,
      this.stopButton,
    )
    toolbar.append(this.status, toolbarActions)

    const viewport = document.createElement('main')
    viewport.className = 'trion-editor-viewport'
    const viewportToolbar = document.createElement('div')
    viewportToolbar.className = 'trion-editor-viewport-toolbar'

    const sceneTab = document.createElement('span')
    sceneTab.className = 'trion-editor-viewport-tab is-active'
    sceneTab.textContent = 'Scene'

    const gizmoTools = document.createElement('div')
    gizmoTools.className = 'trion-editor-gizmo-tools'

    const modes: Array<{ mode: GizmoMode; label: string; shortcut: string }> = [
      { mode: 'translate', label: 'Move', shortcut: 'J' },
      { mode: 'rotate', label: 'Rotate', shortcut: 'K' },
      { mode: 'scale', label: 'Scale', shortcut: 'L' },
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
    statusbarHint.textContent = 'R-drag Orbit • M-drag Pan • Wheel Zoom • WASD Camera • J/K/L Gizmos • F5 Play'
    statusbar.append(statusbarLabel, statusbarHint)

    this.root.append(titlebar, toolbar, this.hierarchy.element, viewport, this.inspector.element, statusbar)
    document.body.appendChild(this.root)

    this.unsubscribeSelection = this.selectionState.onChange((selectedId) => {
      this.selectedEntityId = selectedId
      const scene = this.sceneManager.getActiveScene()
      const entity = selectedId !== null ? scene.getEntity(selectedId) ?? null : null

      this.hierarchy.render(scene.getAllEntities(), selectedId)
      this.inspector.render(entity)
      this.deleteButton.disabled = this.playing || selectedId === null
    })

    this.onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (e.code === 'F5') {
        e.preventDefault()
        this.play()
        return
      }
      if (e.code === 'F8') {
        e.preventDefault()
        this.stop()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault()
        this.undo()
        return
      }
      if (((e.ctrlKey || e.metaKey) && e.code === 'KeyY') || ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault()
        this.redo()
        return
      }

      if (!this.playing) {
        if (e.code === 'KeyJ') {
          this.setGizmoMode('translate')
          e.stopPropagation()
        } else if (e.code === 'KeyK' || e.code === 'KeyE') {
          this.setGizmoMode('rotate')
          e.stopPropagation()
        } else if (e.code === 'KeyL' || e.code === 'KeyR') {
          this.setGizmoMode('scale')
          e.stopPropagation()
        }
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

  isPlaying(): boolean {
    return this.playing
  }

  /** Snapshot scene state and enter Play Mode. */
  play(): void {
    if (this.playing) return

    const scene = this.sceneManager.getActiveScene()
    const sceneData = scene.serialize()
    const entitySnapshot = new Map<number, { metadata: EntityMetadata; components: Component[] }>()

    for (const entity of scene.getAllEntities()) {
      entitySnapshot.set(entity.id, {
        metadata: { name: entity.name, tag: entity.tag },
        components: entity.getAllComponents().map((c) => cloneComponent(c)),
      })
    }

    this.prePlaySnapshot = {
      sceneData,
      entitySnapshot,
      selectedEntityId: this.selectedEntityId,
    }

    this.playing = true
    this.editorViewActive = false
    this.editorCamera.setEnabled(false)
    this.picker.setEnabled(false)
    this.gizmo.detach()
    this.grid.setVisible(false)
    this.selectionHighlight.setVisible(false)
    this.history.setDisabled(true)

    this.root.classList.add('is-playing')
    this.playButton.disabled = true
    this.stopButton.disabled = false
    this.createButton.disabled = true
    this.deleteButton.disabled = true
    this.undoButton.disabled = true
    this.redoButton.disabled = true
    this.titlebarMeta.textContent = 'PLAYING'
    this.status.textContent = 'Playing...'
  }

  /** Restore the pre-play snapshot and resume editing. */
  stop(): void {
    if (!this.playing || !this.prePlaySnapshot) return

    const scene = this.sceneManager.getActiveScene()
    const snapshot = this.prePlaySnapshot

    scene.deserialize(snapshot.sceneData)

    for (const [entityId, { metadata, components }] of snapshot.entitySnapshot) {
      let entity = scene.getEntity(entityId)
      if (!entity) {
        entity = (scene as any).createEntityWithId(entityId, metadata) as Entity
      }
      if (!entity) continue

      entity.name = metadata.name
      entity.tag = metadata.tag

      for (const existing of entity.getAllComponents()) {
        entity.removeComponent(existing.type)
      }
      for (const comp of components) {
        entity.addComponent(cloneComponent(comp))
      }
    }

    this.playing = false
    this.editorViewActive = true
    this.editorCamera.setEnabled(true)
    this.picker.setEnabled(true)
    this.grid.setVisible(true)
    this.selectionHighlight.setVisible(true)
    this.history.setDisabled(false)

    // Push restored state to the viewport now; also drops Play-created meshes.
    this.meshRendererSystem.sync()

    // Re-select even when the ID is unchanged (same-ID select is a no-op),
    // so the Inspector and gizmo rebind to the restored objects.
    const restoredSelectionId = snapshot.selectedEntityId
    this.selectionState.select(null)
    if (restoredSelectionId !== null && scene.getEntity(restoredSelectionId)) {
      this.selectionState.select(restoredSelectionId)
    }
    this.prePlaySnapshot = null

    this.root.classList.remove('is-playing')
    this.playButton.disabled = false
    this.stopButton.disabled = true
    this.createButton.disabled = false
    this.deleteButton.disabled = this.selectedEntityId === null
    this.titlebarMeta.textContent = 'WebGL'

    this.updateHistoryButtons()
    this.hierarchySignature = ''
    this.update()
  }

  undo(): void {
    if (this.playing) return
    this.history.undo()
  }

  redo(): void {
    if (this.playing) return
    this.history.redo()
  }

  private updateHistoryButtons(): void {
    this.undoButton.disabled = this.playing || !this.history.canUndo()
    this.redoButton.disabled = this.playing || !this.history.canRedo()
  }

  private recordTransformChange(entityId: number, before: TransformData, after: TransformData): void {
    if (this.playing) return

    this.history.execute({
      description: 'Change Transform',
      undo: () => {
        const entity = this.sceneManager.getActiveScene().getEntity(entityId)
        const t = entity?.getComponent<TransformComponent>('transform')
        if (t) {
          t.position.x = before.position.x
          t.position.y = before.position.y
          t.position.z = before.position.z
          t.rotation.x = before.rotation.x
          t.rotation.y = before.rotation.y
          t.rotation.z = before.rotation.z
          t.scale.x = before.scale.x
          t.scale.y = before.scale.y
          t.scale.z = before.scale.z
          this.inspector.syncValues(t)
        }
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        }
        this.meshRendererSystem.sync()
      },
      redo: () => {
        const entity = this.sceneManager.getActiveScene().getEntity(entityId)
        const t = entity?.getComponent<TransformComponent>('transform')
        if (t) {
          t.position.x = after.position.x
          t.position.y = after.position.y
          t.position.z = after.position.z
          t.rotation.x = after.rotation.x
          t.rotation.y = after.rotation.y
          t.rotation.z = after.rotation.z
          t.scale.x = after.scale.x
          t.scale.y = after.scale.y
          t.scale.z = after.scale.z
          this.inspector.syncValues(t)
        }
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        }
        this.meshRendererSystem.sync()
      },
    })
  }

  /** Refresh scene-derived editor state and update camera/helpers. */
  update(): void {
    const scene = this.sceneManager.getActiveScene()
    const entities = scene.getAllEntities()

    if (scene !== this.activeScene) {
      this.activeScene = scene
      this.selectionState.select(null)
      this.hierarchySignature = ''
    }

    if (this.selectedEntityId !== null && !scene.getEntity(this.selectedEntityId)) {
      this.selectionState.select(null)
    }

    const signature = entities.map((entity) => `${entity.id}:${entity.name ?? ''}`).join('|')
    if (signature !== this.hierarchySignature) {
      this.hierarchySignature = signature
      this.hierarchy.render(entities, this.selectedEntityId)
    }

    this.deleteButton.disabled = this.playing || this.selectedEntityId === null
    if (!this.playing) {
      this.status.textContent = `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`
    }

    if (!this.playing) {
      this.editorCamera.update()
      this.selectionHighlight.update()
      this.gizmo.update()
    }
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
    this.history.clear()
    this.hierarchy.dispose()
    this.inspector.dispose()
    this.root.remove()
  }

  private createEntity(): void {
    if (this.playing) return

    const scene = this.sceneManager.getActiveScene()
    const entity = scene.createEntity()
    entity.name = `Entity ${entity.id}`
    const entityId = entity.id
    const entityName = entity.name
    this.selectionState.select(entityId)

    this.history.execute({
      description: `Create ${entityName}`,
      undo: () => {
        scene.destroyEntity(entityId)
        if (this.selectedEntityId === entityId) {
          this.selectionState.select(null)
        }
        this.hierarchySignature = ''
        this.meshRendererSystem.sync()
        this.update()
      },
      redo: () => {
        const recreated = (scene as any).createEntityWithId(entityId, { name: entityName })
        this.selectionState.select(recreated.id)
        this.hierarchySignature = ''
        this.meshRendererSystem.sync()
        this.update()
      },
    })
  }

  private deleteSelectedEntity(): void {
    if (this.playing || this.selectedEntityId === null) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(this.selectedEntityId)
    if (!entity) return

    const idToDelete = entity.id
    const metadata: EntityMetadata = { name: entity.name, tag: entity.tag }
    const savedComponents = entity.getAllComponents().map((c) => cloneComponent(c))

    this.selectionState.select(null)
    scene.destroyEntity(idToDelete)
    this.hierarchySignature = ''
    this.update()

    this.history.execute({
      description: `Delete ${metadata.name ?? `Entity ${idToDelete}`}`,
      undo: () => {
        const recreated = (scene as any).createEntityWithId(idToDelete, metadata)
        for (const comp of savedComponents) {
          recreated.addComponent(cloneComponent(comp))
        }
        this.selectionState.select(recreated.id)
        this.hierarchySignature = ''
        this.meshRendererSystem.sync()
        this.update()
      },
      redo: () => {
        scene.destroyEntity(idToDelete)
        if (this.selectedEntityId === idToDelete) {
          this.selectionState.select(null)
        }
        this.hierarchySignature = ''
        this.meshRendererSystem.sync()
        this.update()
      },
    })
  }
}

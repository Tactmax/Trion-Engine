import type * as THREE from 'three'
import { BoxGeometry, SphereGeometry } from 'three'
import type { Component, Entity, EntityMetadata, Scene, SceneData, SceneManager } from '../engine/index.ts'
import { createAnimation, createBoxCollider, createMeshRenderer, createRigidBody, createSphereCollider, createTransform } from '../engine/index.ts'
import { applyParentLink, canReparent, computePreservedLocal, getParentId } from '../engine/index.ts'
import { createLightComponent, type LightComponentType } from '../engine/components/Light.ts'
import type { MeshRendererComponent } from '../engine/components/MeshRenderer.ts'
import {
  applyMaterialProps,
  cloneMaterialProps,
  createMaterialFromDefinition,
  DEFAULT_MATERIAL_PROPS,
  materialPropsEqual,
  readMaterialProps,
  snapshotMaterialProps,
  type MaterialDefinition,
  type MaterialProps,
} from '../engine/graphics/MaterialUtils.ts'
import type { GLTFAssetResult } from '../engine/index.ts'
import type { AssetManager } from '../engine/graphics/AssetManager.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { LightSystem } from '../engine/graphics/LightSystem.ts'
import type { AnimationSystem } from '../engine/systems/AnimationSystem.ts'
import type { PhysicsSystem } from '../engine/physics/PhysicsSystem.ts'
import type { TransformComponent } from '../engine/components/Transform.ts'
import type { RigidBodyComponent } from '../engine/components/RigidBody.ts'
import type { BoxColliderComponent } from '../engine/components/BoxCollider.ts'
import type { SphereColliderComponent } from '../engine/components/SphereCollider.ts'
import { HierarchyPanel } from './HierarchyPanel.ts'
import { InspectorPanel, type PhysicsComponentType } from './InspectorPanel.ts'
import { SelectionState } from './SelectionState.ts'
import { EditorCamera } from './EditorCamera.ts'
import { EditorGrid } from './EditorGrid.ts'
import { ColliderVisualizer } from './ColliderVisualizer.ts'
import { LightVisualizer } from './LightVisualizer.ts'
import { MaterialStore } from './MaterialStore.ts'
import { EntityPicker } from './EntityPicker.ts'
import { SelectionHighlight } from './SelectionHighlight.ts'
import { GizmoController, type GizmoMode } from './GizmoController.ts'
import { AssetBrowser, assetIdForFile, ASSET_DROP_MIME, PREFAB_FOLDER, prefabAssetForName, prefabNameFromAsset, sceneAssetForName, sceneNameFromAsset, materialAssetForId, materialIdFromAsset, type AssetFileInfo } from './AssetBrowser.ts'
import { showConfirmDialog, showOptionsDialog, showPromptDialog } from './Modal.ts'
import { PrefabStore } from './PrefabStore.ts'
import { SceneStore } from './SceneStore.ts'
import { cloneComponent, cloneValue, EditorHistory, type TransformData } from './EditorHistory.ts'
import { destroyDuplicatedEntities, duplicateEntitySubtree, restoreDuplicatedEntities } from './duplicateEntity.ts'

interface PrePlaySnapshot {
  sceneData: SceneData
  entitySnapshot: Map<number, { metadata: EntityMetadata; components: Component[] }>
  selectedEntityId: number | null
}

interface PreEditSnapshot {
  sceneData: SceneData
  entitySnapshot: Map<number, { metadata: EntityMetadata; components: Component[] }>
  selectedEntityId: number | null
  selectedAssetPath: string | null
}

export type CreateEntityKind = 'empty' | 'cube' | 'sphere' | 'directionalLight' | 'pointLight' | 'spotLight'

function isSceneDataLike(data: unknown): data is SceneData {
  return typeof data === 'object' && data !== null && !Array.isArray(data) &&
    Array.isArray((data as Record<string, unknown>).entities)
}

/**
 * Browser editor shell for viewport navigation, picking, transform gizmos,
 * selection, undo/redo history, play mode, and the asset/prefab/scene workflows.
 * Call update() from the host application's existing frame lifecycle.
 */
export class Editor {
  private readonly sceneManager: SceneManager
  private readonly root: HTMLElement
  private readonly hierarchy: HierarchyPanel
  private readonly inspector: InspectorPanel
  private readonly createButton: HTMLButtonElement
  private readonly deleteButton: HTMLButtonElement
  private readonly duplicateButton: HTMLButtonElement
  private readonly renameButton: HTMLButtonElement
  private readonly undoButton: HTMLButtonElement
  private readonly redoButton: HTMLButtonElement
  private readonly playButton: HTMLButtonElement
  private readonly stopButton: HTMLButtonElement
  private readonly assetsButton: HTMLButtonElement
  private readonly savePrefabButton: HTMLButtonElement
  private readonly cancelPrefabButton: HTMLButtonElement
  private readonly newSceneButton: HTMLButtonElement
  private readonly saveSceneButton: HTMLButtonElement
  private readonly saveSceneAsButton: HTMLButtonElement
  private readonly fileMenu: HTMLElement
  private readonly fileMenuButton: HTMLButtonElement
  private readonly fileMenuPanel: HTMLElement
  private readonly createMenu: HTMLElement
  private readonly createMenuPanel: HTMLElement
  private readonly modifyMenu: HTMLElement
  private readonly modifyMenuButton: HTMLButtonElement
  private readonly modifyMenuPanel: HTMLElement
  private assetsOpen = true
  private readonly status: HTMLElement
  private readonly titlebarMeta: HTMLElement
  private readonly sceneTitle: HTMLElement

  private readonly history: EditorHistory
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly animationSystem: AnimationSystem | undefined
  private readonly lightSystem: LightSystem | undefined
  private readonly physicsSystem: PhysicsSystem | undefined
  private readonly assetManager: AssetManager | undefined
  private readonly prefabStore: PrefabStore
  private readonly sceneStore: SceneStore
  private readonly materialStore: MaterialStore
  private readonly selectionState: SelectionState
  private readonly editorCamera: EditorCamera
  private readonly grid: EditorGrid
  private readonly colliderVisualizer: ColliderVisualizer
  private readonly lightVisualizer: LightVisualizer
  private readonly gizmo: GizmoController
  private readonly selectionHighlight: SelectionHighlight
  private readonly picker: EntityPicker
  private readonly assetBrowser: AssetBrowser
  private readonly canvas: HTMLCanvasElement

  private activeScene: Scene | null = null
  private selectedEntityId: number | null = null
  private lastSelectedEntityId: number | null = null
  private selectedAsset: AssetFileInfo | null = null
  private readonly pendingGLTFLoads = new Map<string, Promise<GLTFAssetResult>>()
  private prePlayMaterialIds: string[] | null = null
  private prePlayMaterialProps: Map<string, MaterialProps | null> | null = null
  private spawnCount = 0
  private hierarchySignature = ''
  private editorViewActive = true
  private playing = false
  private prePlaySnapshot: PrePlaySnapshot | null = null
  private editingPrefab: string | null = null
  private editingEntityId: number | null = null
  private preEditSnapshot: PreEditSnapshot | null = null
  private sceneName: string | null = null
  private sceneDirty = false

  private readonly modeButtons = new Map<GizmoMode, HTMLButtonElement>()
  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly onBeforeUnload: (e: BeforeUnloadEvent) => void
  private readonly onDocumentPointerDown: (e: PointerEvent) => void
  private readonly onCanvasDragOver: (e: DragEvent) => void
  private readonly onCanvasDrop: (e: DragEvent) => void
  private readonly unsubscribeSelection: () => void

  constructor(
    sceneManager: SceneManager,
    canvas: HTMLCanvasElement,
    renderer: Renderer,
    meshRendererSystem: MeshRendererSystem,
    animationSystem?: AnimationSystem,
    assetManager?: AssetManager,
    physicsSystem?: PhysicsSystem,
    lightSystem?: LightSystem,
  ) {
    this.sceneManager = sceneManager
    this.meshRendererSystem = meshRendererSystem
    this.animationSystem = animationSystem
    this.lightSystem = lightSystem
    this.physicsSystem = physicsSystem
    this.assetManager = assetManager
    this.canvas = canvas
    this.prefabStore = new PrefabStore()
    this.sceneStore = new SceneStore()
    this.materialStore = new MaterialStore()

    this.history = new EditorHistory(50, () => {
      this.updateHistoryButtons()
    })

    this.selectionState = new SelectionState()
    this.editorCamera = new EditorCamera(canvas)
    this.grid = new EditorGrid(renderer)
    this.colliderVisualizer = new ColliderVisualizer(renderer, () => this.sceneManager.getActiveScene())
    this.lightVisualizer = new LightVisualizer(renderer, () => this.sceneManager.getActiveScene())

    this.hierarchy = new HierarchyPanel({
      onSelectEntity: (entity) => {
        if (!this.playing) {
          this.selectionState.select(entity.id)
        }
      },
      getParentId: (entityId) => getParentId(this.sceneManager.getActiveScene(), entityId),
      onRenameEntity: (entity, newName) => {
        this.renameEntity(entity.id, newName)
      },
      onReparentEntity: (childId, newParentId) => {
        this.reparentEntity(childId, newParentId)
      },
    })

    this.inspector = new InspectorPanel({
      onTransformCommit: (entityId, before, after) => {
        this.recordTransformChange(entityId, before, after)
      },
      onPhysicsCommit: (entityId, componentType, before, after) => {
        this.recordPhysicsChange(entityId, componentType, before, after)
      },
      onAddPhysicsComponent: (entityId, componentType) => {
        this.addPhysicsComponent(entityId, componentType)
      },
      onRemovePhysicsComponent: (entityId, componentType) => {
        this.removePhysicsComponent(entityId, componentType)
      },
      onMaterialAssign: (entityId, beforeId, afterId) => {
        this.recordMaterialAssign(entityId, beforeId, afterId)
      },
      onMaterialPreview: (materialId, props) => {
        this.previewMaterialProps(materialId, props)
      },
      onMaterialPropCommit: (entityId, materialId, before, after) => {
        this.recordMaterialPropChange(entityId, materialId, before, after)
      },
      onCreateMaterial: (entityId) => {
        void this.createMaterialForEntity(entityId)
      },
      getMaterialList: () => this.listEditorMaterials(),
      getMaterialProps: (materialId) => this.readEditorMaterialProps(materialId),
      onLightCommit: (entityId, componentType, before, after) => {
        this.recordLightChange(entityId, componentType, before, after)
      },
      onAddLightComponent: (entityId, componentType) => {
        this.addLightComponent(entityId, componentType)
      },
      onRemoveLightComponent: (entityId, componentType) => {
        this.removeLightComponent(entityId, componentType)
      },
      onAnimationCommit: (entityId, before, after) => {
        this.recordAnimationChange(entityId, before, after)
      },
      onAddAnimationComponent: (entityId) => {
        this.addAnimationComponent(entityId)
      },
      onRemoveAnimationComponent: (entityId) => {
        this.removeAnimationComponent(entityId)
      },
      onAnimationStopPreview: (entityId) => {
        this.stopAnimationPreview(entityId)
      },
      onAnimationPreviewToggle: (entityId, playing) => {
        this.previewToggleAnimation(entityId, playing)
      },
      getAnimationClips: (entityId) => this.getAnimationClipsForEntity(entityId),
      getAnimationSource: (entityId) => this.getAnimationSourceForEntity(entityId),
    })

    this.assetBrowser = new AssetBrowser({
      onSelectAsset: (asset) => {
        this.selectAsset(asset)
      },
      onInstantiateAsset: (asset) => {
        if (asset.kind === 'prefab') {
          const name = prefabNameFromAsset(asset)
          if (name) this.instantiatePrefab(name)
          return
        }
        if (asset.kind === 'scene') {
          void this.openSceneAsset(asset)
          return
        }
        if (asset.kind === 'material') {
          this.assignMaterialFromBrowser(asset)
          return
        }
        void this.instantiateAsset(asset)
      },
      getPrefabAssets: () => this.prefabStore.listNames().map((name) => prefabAssetForName(name)),
      getSceneAssets: () => this.sceneStore.listNames().map((name) => sceneAssetForName(name)),
      getMaterialAssets: () => this.materialStore.list().map((def) => materialAssetForId(def.id)),
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
    this.sceneTitle = sceneTitle
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
    this.createButton.textContent = 'Create ▼'
    this.createButton.title = 'Create Entity'
    this.createButton.setAttribute('aria-haspopup', 'true')
    this.createButton.setAttribute('aria-expanded', 'false')
    this.createButton.addEventListener('click', () => this.setCreateMenuOpen(this.createMenuPanel.hidden === true))

    const modifyMenu = document.createElement('div')
    modifyMenu.className = 'trion-editor-menu'
    this.modifyMenu = modifyMenu
    this.modifyMenuButton = document.createElement('button')
    this.modifyMenuButton.type = 'button'
    this.modifyMenuButton.className = 'trion-editor-button'
    this.modifyMenuButton.textContent = 'Modify Selected ▼'
    this.modifyMenuButton.title = 'Rename, duplicate or delete the selected entity'
    this.modifyMenuButton.setAttribute('aria-haspopup', 'true')
    this.modifyMenuButton.setAttribute('aria-expanded', 'false')
    this.modifyMenuButton.disabled = true
    this.modifyMenuButton.addEventListener('click', () => this.setModifyMenuOpen(this.modifyMenuPanel.hidden === true))
    this.modifyMenuPanel = document.createElement('div')
    this.modifyMenuPanel.className = 'trion-editor-menu-panel'
    this.modifyMenuPanel.hidden = true
    modifyMenu.append(this.modifyMenuButton, this.modifyMenuPanel)

    const appendModifyItem = (
      button: HTMLButtonElement,
      label: string,
      shortcut: string | null,
      title: string,
      onClick: () => void,
    ): void => {
      button.type = 'button'
      button.className = 'trion-editor-menu-item'
      const labelEl = document.createElement('span')
      labelEl.textContent = label
      button.appendChild(labelEl)
      if (shortcut) {
        const hint = document.createElement('span')
        hint.className = 'trion-editor-menu-shortcut'
        hint.textContent = shortcut
        button.appendChild(hint)
      }
      button.title = title
      button.disabled = true
      button.addEventListener('click', () => {
        this.setModifyMenuOpen(false)
        onClick()
      })
      this.modifyMenuPanel.appendChild(button)
    }

    this.renameButton = document.createElement('button')
    appendModifyItem(this.renameButton, 'Rename…', 'F2', 'Rename Selected (F2)', () => {
      this.renameSelectedEntity()
    })

    this.duplicateButton = document.createElement('button')
    appendModifyItem(this.duplicateButton, 'Duplicate Selected', 'Ctrl+D', 'Duplicate Selected (Ctrl+D)', () => {
      this.duplicateSelectedEntity()
    })

    this.deleteButton = document.createElement('button')
    appendModifyItem(this.deleteButton, 'Delete Selected', null, 'Delete Selected', () => {
      this.deleteSelectedEntity()
    })

    this.assetsButton = document.createElement('button')
    this.assetsButton.type = 'button'
    this.assetsButton.className = 'trion-editor-button is-assets'
    const assetsLabel = document.createElement('span')
    assetsLabel.className = 'trion-editor-gradient-text'
    assetsLabel.textContent = 'Assets'
    this.assetsButton.appendChild(assetsLabel)
    this.assetsButton.title = 'Toggle Asset Browser'
    this.assetsButton.setAttribute('aria-pressed', 'false')
    this.assetsButton.addEventListener('click', () => this.toggleAssetBrowser())

    const fileMenu = document.createElement('div')
    fileMenu.className = 'trion-editor-menu'
    this.fileMenu = fileMenu
    this.fileMenuButton = document.createElement('button')
    this.fileMenuButton.type = 'button'
    this.fileMenuButton.className = 'trion-editor-button is-file'
    this.fileMenuButton.textContent = 'Save Scene ▼'
    this.fileMenuButton.title = 'Scene file actions'
    this.fileMenuButton.setAttribute('aria-haspopup', 'true')
    this.fileMenuButton.setAttribute('aria-expanded', 'false')
    this.fileMenuButton.addEventListener('click', () => this.setFileMenuOpen(this.fileMenuPanel.hidden === true))
    this.fileMenuPanel = document.createElement('div')
    this.fileMenuPanel.className = 'trion-editor-menu-panel'
    this.fileMenuPanel.hidden = true
    fileMenu.append(this.fileMenuButton, this.fileMenuPanel)

    const appendMenuItem = (
      button: HTMLButtonElement,
      label: string,
      shortcut: string | null,
      title: string,
      onClick: () => void,
    ): void => {
      button.type = 'button'
      button.className = 'trion-editor-menu-item'
      const labelEl = document.createElement('span')
      labelEl.textContent = label
      button.appendChild(labelEl)
      if (shortcut) {
        const hint = document.createElement('span')
        hint.className = 'trion-editor-menu-shortcut'
        hint.textContent = shortcut
        button.appendChild(hint)
      }
      button.title = title
      button.addEventListener('click', () => {
        this.setFileMenuOpen(false)
        onClick()
      })
      this.fileMenuPanel.appendChild(button)
    }

    this.newSceneButton = document.createElement('button')
    appendMenuItem(this.newSceneButton, 'New Scene', null, 'New Scene', () => {
      void this.newScene()
    })

    this.saveSceneButton = document.createElement('button')
    appendMenuItem(this.saveSceneButton, 'Save', 'Ctrl+S', 'Save Scene (Ctrl+S)', () => this.saveScene())

    this.saveSceneAsButton = document.createElement('button')
    appendMenuItem(this.saveSceneAsButton, 'Save As…', 'Ctrl+Shift+S', 'Save Scene As (Ctrl+Shift+S)', () => {
      void this.saveSceneAs()
    })

    const createMenu = document.createElement('div')
    createMenu.className = 'trion-editor-menu'
    this.createMenu = createMenu
    this.createMenuPanel = document.createElement('div')
    this.createMenuPanel.className = 'trion-editor-menu-panel'
    this.createMenuPanel.hidden = true
    createMenu.append(this.createButton, this.createMenuPanel)
    const createOptions: Array<{ kind: CreateEntityKind; label: string; title: string }> = [
      { kind: 'empty', label: 'Empty', title: 'Create an empty entity' },
      { kind: 'cube', label: 'Cube', title: 'Create a cube entity' },
      { kind: 'sphere', label: 'Sphere', title: 'Create a sphere entity' },
      { kind: 'directionalLight', label: 'Directional Light', title: 'Create a directional light entity' },
      { kind: 'pointLight', label: 'Point Light', title: 'Create a point light entity' },
      { kind: 'spotLight', label: 'Spot Light', title: 'Create a spot light entity' },
    ]
    for (const { kind, label, title } of createOptions) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'trion-editor-menu-item'
      const labelEl = document.createElement('span')
      labelEl.textContent = label
      item.appendChild(labelEl)
      item.title = title
      item.addEventListener('click', () => {
        this.setCreateMenuOpen(false)
        this.createEntity(kind)
      })
      this.createMenuPanel.appendChild(item)
    }

    this.savePrefabButton = document.createElement('button')
    this.savePrefabButton.type = 'button'
    this.savePrefabButton.className = 'trion-editor-button is-primary'
    this.savePrefabButton.textContent = 'Save Prefab'
    this.savePrefabButton.title = 'Save prefab changes and return to the scene'
    this.savePrefabButton.hidden = true
    this.savePrefabButton.addEventListener('click', () => this.savePrefabEdits())

    this.cancelPrefabButton = document.createElement('button')
    this.cancelPrefabButton.type = 'button'
    this.cancelPrefabButton.className = 'trion-editor-button'
    this.cancelPrefabButton.textContent = 'Cancel'
    this.cancelPrefabButton.title = 'Discard prefab changes and return to the scene'
    this.cancelPrefabButton.hidden = true
    this.cancelPrefabButton.addEventListener('click', () => this.cancelPrefabEdit())

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
      this.createMenu,
      this.modifyMenu,
      this.assetsButton,
      this.savePrefabButton,
      this.cancelPrefabButton,
      this.playButton,
      this.stopButton,
    )
    toolbar.append(fileMenu, this.status, toolbarActions)

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

    this.root.append(titlebar, toolbar, this.hierarchy.element, viewport, this.inspector.element, this.assetBrowser.element, statusbar)
    document.body.appendChild(this.root)

    this.unsubscribeSelection = this.selectionState.onChange((selectedId) => {
      this.selectedEntityId = selectedId
      if (selectedId !== null) this.lastSelectedEntityId = selectedId
      const scene = this.sceneManager.getActiveScene()
      const entity = selectedId !== null ? scene.getEntity(selectedId) ?? null : null

      if (selectedId !== null && this.selectedAsset !== null) {
        this.selectedAsset = null
        this.assetBrowser.clearSelection()
      }
      this.hierarchy.render(scene.getAllEntities(), selectedId)
      this.renderInspectorForSelection(entity)
      this.updateModifyMenuState()
    })

    this.onCanvasDragOver = (e: DragEvent) => {
      if (this.playing || !this.assetManager || !e.dataTransfer) return
      const types = Array.from(e.dataTransfer.types)
      if (!types.includes(ASSET_DROP_MIME) && !types.includes('text/plain')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
    this.onCanvasDrop = (e: DragEvent) => {
      if (this.playing || this.editingPrefab !== null || !e.dataTransfer) return
      const relativePath = e.dataTransfer.getData(ASSET_DROP_MIME) || e.dataTransfer.getData('text/plain')
      if (!relativePath) return
      const asset = this.assetBrowser.findAsset(relativePath.trim())
      if (!asset || (asset.kind !== 'model' && asset.kind !== 'prefab')) return
      if (asset.kind === 'prefab') {
        const name = prefabNameFromAsset(asset)
        if (!name) return
        e.preventDefault()
        this.instantiatePrefab(name)
        return
      }
      if (!this.assetManager) return
      e.preventDefault()
      void this.instantiateAsset(asset)
    }
    canvas.addEventListener('dragover', this.onCanvasDragOver)
    canvas.addEventListener('drop', this.onCanvasDrop)

    this.onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      if (e.code === 'Escape' && (!this.fileMenuPanel.hidden || !this.createMenuPanel.hidden || !this.modifyMenuPanel.hidden)) {
        this.setFileMenuOpen(false)
        this.setCreateMenuOpen(false)
        this.setModifyMenuOpen(false)
        return
      }
      if (e.code === 'F5') {
        e.preventDefault()
        this.play()
        return
      }
      if (e.code === 'F2') {
        e.preventDefault()
        this.renameSelectedEntity()
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
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault()
        if (e.shiftKey) {
          void this.saveSceneAs()
        } else {
          this.saveScene()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
        e.preventDefault()
        this.duplicateSelectedEntity()
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

    this.onDocumentPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!this.fileMenuPanel.hidden && target && !this.fileMenu.contains(target)) {
        this.setFileMenuOpen(false)
      }
      if (!this.createMenuPanel.hidden && target && !this.createMenu.contains(target)) {
        this.setCreateMenuOpen(false)
      }
      if (!this.modifyMenuPanel.hidden && target && !this.modifyMenu.contains(target)) {
        this.setModifyMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', this.onDocumentPointerDown)

    this.onBeforeUnload = (e: BeforeUnloadEvent) => {
      if ((this.sceneDirty || this.editingPrefab !== null) && !this.playing) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', this.onBeforeUnload)

    this.syncMaterialAssets()
    this.toggleAssetBrowser(true)
    this.update()
  }

  setGizmoMode(mode: GizmoMode): void {
    this.gizmo.setMode(mode)
    for (const [m, btn] of this.modeButtons.entries()) {
      btn.classList.toggle('is-active', m === mode)
    }
  }

  toggleAssetBrowser(open?: boolean): void {
    this.assetsOpen = open ?? !this.assetsOpen
    this.root.classList.toggle('is-assets-open', this.assetsOpen)
    this.assetsButton.classList.toggle('is-active', this.assetsOpen)
    this.assetsButton.setAttribute('aria-pressed', String(this.assetsOpen))
  }

  isAssetBrowserOpen(): boolean {
    return this.assetsOpen
  }

  private setFileMenuOpen(open: boolean): void {
    this.fileMenuPanel.hidden = !open
    this.fileMenuButton.setAttribute('aria-expanded', String(open))
  }

  private setCreateMenuOpen(open: boolean): void {
    this.createMenuPanel.hidden = !open
    this.createButton.setAttribute('aria-expanded', String(open))
  }

  private setModifyMenuOpen(open: boolean): void {
    this.modifyMenuPanel.hidden = !open
    this.modifyMenuButton.setAttribute('aria-expanded', String(open))
  }

  private updateModifyMenuState(): void {
    const canModify = !this.playing && this.selectedEntityId !== null
    this.modifyMenuButton.disabled = !canModify
    this.renameButton.disabled = !canModify
    this.deleteButton.disabled = !canModify
    this.duplicateButton.disabled = !canModify || this.editingPrefab !== null
  }

  /** Begin inline rename for the selected entity. No-op when nothing can be renamed. */
  private renameSelectedEntity(): void {
    if (this.playing || this.selectedEntityId === null) return
    this.hierarchy.beginRename(this.selectedEntityId)
  }

  getCamera(): THREE.PerspectiveCamera {
    return this.editorCamera.camera
  }

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

  play(): void {
    if (this.playing || this.editingPrefab !== null) return

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

    // Snapshot live material state so runtime material mutations are discarded on Stop.
    if (this.assetManager) {
      this.prePlayMaterialIds = this.assetManager.listMaterialIds()
      this.prePlayMaterialProps = snapshotMaterialProps(this.assetManager.listMaterials())
    } else {
      this.prePlayMaterialIds = null
      this.prePlayMaterialProps = null
    }

    // Discard any previous run's backend bodies so Play always starts fresh.
    this.physicsSystem?.reset()

    this.playing = true
    this.editorViewActive = false
    this.editorCamera.setEnabled(false)
    this.picker.setEnabled(false)
    this.gizmo.detach()
    this.grid.setVisible(false)
    this.colliderVisualizer.setVisible(false)
    this.lightVisualizer.setVisible(false)
    this.selectionHighlight.setVisible(false)
    this.history.setDisabled(true)
    this.assetBrowser.setDisabled(true)

    this.root.classList.add('is-playing')
    this.playButton.disabled = true
    this.stopButton.disabled = false
    this.createButton.disabled = true
    this.updateModifyMenuState()
    this.undoButton.disabled = true
    this.redoButton.disabled = true
    this.newSceneButton.disabled = true
    this.saveSceneButton.disabled = true
    this.saveSceneAsButton.disabled = true
    this.titlebarMeta.textContent = 'PLAYING'
    this.status.textContent = 'Playing...'
    if (this.selectedAsset) {
      this.showSelectedAsset(false)
    } else {
      // Refresh so physics add/remove buttons are hidden while playing.
      this.renderInspectorForSelection()
    }
  }

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
    this.colliderVisualizer.setVisible(true)
    this.lightVisualizer.setVisible(true)
    this.selectionHighlight.setVisible(true)
    this.history.setDisabled(false)
    this.assetBrowser.setDisabled(false)

    // Discard runtime physics bodies so simulation state never leaks into edit mode.
    this.physicsSystem?.reset()

    this.restorePrePlayMaterials()

    // Discard runtime animation mixers/targets; the next update rebuilds
    // entries from the restored components starting at time zero.
    this.animationSystem?.clear()

    // Push restored state to the viewport now; also drops Play-created meshes and lights.
    this.syncViewportSystems()

    // Re-select even when the ID is unchanged (same-ID select is a no-op),
    // so the Inspector and gizmo rebind to the restored objects.
    const restoredSelectionId = snapshot.selectedEntityId
    this.selectionState.select(null)
    if (restoredSelectionId !== null && scene.getEntity(restoredSelectionId)) {
      this.selectionState.select(restoredSelectionId)
    } else if (this.selectedAsset && this.selectedEntityId === null) {
      this.showSelectedAsset(true)
    }
    this.prePlaySnapshot = null

    this.root.classList.remove('is-playing')
    this.playButton.disabled = false
    this.stopButton.disabled = true
    this.createButton.disabled = false
    this.newSceneButton.disabled = false
    this.saveSceneButton.disabled = false
    this.saveSceneAsButton.disabled = false
    this.updateModifyMenuState()
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

  /** Push ECS state to the viewport now (meshes, lights, animation targets). */
  private syncViewportSystems(): void {
    this.meshRendererSystem.sync()
    this.lightSystem?.sync()
    // Zero-delta rebuild: refreshes animation entries (add/remove/undo/redo)
    // without advancing playback time.
    this.animationSystem?.update(0)
  }

  private recordTransformChange(entityId: number, before: TransformData, after: TransformData): void {
    if (this.playing) return

    this.markSceneDirty()
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
        this.syncViewportSystems()
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
        this.syncViewportSystems()
      },
    })
  }

  private renderInspectorForSelection(entity?: Entity | null): void {
    const target = entity ?? (
      this.selectedEntityId !== null
        ? this.sceneManager.getActiveScene().getEntity(this.selectedEntityId) ?? null
        : null
    )
    this.inspector.render(target, {
      canSaveAsPrefab: !this.playing && this.editingPrefab === null && target !== null,
      canEditComponents: !this.playing,
      onSaveAsPrefab: (selected) => {
        void this.createPrefabFromEntity(selected)
      },
    })
  }

  private recordPhysicsChange(
    entityId: number,
    componentType: PhysicsComponentType,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): void {
    if (this.playing) return

    this.markSceneDirty()
    const label = physicsComponentLabel(componentType)
    this.history.execute({
      description: `Change ${label}`,
      undo: () => {
        this.applyPhysicsSnapshot(entityId, componentType, before)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        this.applyPhysicsSnapshot(entityId, componentType, after)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private applyPhysicsSnapshot(
    entityId: number,
    componentType: PhysicsComponentType,
    snapshot: Record<string, unknown>,
  ): void {
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const component = entity?.getComponent(componentType)
    if (!component) return
    for (const [key, value] of Object.entries(snapshot)) {
      if (key === 'type') continue
      ;(component as unknown as Record<string, unknown>)[key] = cloneValue(value)
    }
  }

  private addPhysicsComponent(entityId: number, componentType: PhysicsComponentType): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    if (!entity || entity.hasComponent(componentType)) return

    entity.addComponent(createPhysicsComponent(componentType))
    this.markSceneDirty()
    this.renderInspectorForSelection(entity)
    this.update()

    const label = physicsComponentLabel(componentType)
    this.history.execute({
      description: `Add ${label}`,
      undo: () => {
        scene.getEntity(entityId)?.removeComponent(componentType)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        const target = scene.getEntity(entityId)
        if (target && !target.hasComponent(componentType)) {
          target.addComponent(createPhysicsComponent(componentType))
        }
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private removePhysicsComponent(entityId: number, componentType: PhysicsComponentType): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    const existing = entity?.getComponent(componentType)
    if (!entity || !existing) return

    const saved = cloneComponent(existing)
    entity.removeComponent(componentType)
    this.markSceneDirty()
    this.renderInspectorForSelection(entity)
    this.update()

    const label = physicsComponentLabel(componentType)
    this.history.execute({
      description: `Remove ${label}`,
      undo: () => {
        const target = scene.getEntity(entityId)
        if (target && !target.hasComponent(componentType)) {
          target.addComponent(cloneComponent(saved))
        }
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        scene.getEntity(entityId)?.removeComponent(componentType)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private listEditorMaterials(): Array<{ id: string; label: string }> {
    const ids = new Set<string>()
    if (this.assetManager) {
      for (const id of this.assetManager.listMaterialIds()) ids.add(id)
    }
    for (const def of this.materialStore.list()) ids.add(def.id)
    return [...ids].sort((a, b) => a.localeCompare(b)).map((id) => {
      const stored = this.materialStore.get(id)
      return { id, label: stored ? `${stored.name} (${id})` : id }
    })
  }

  private readEditorMaterialProps(materialId: string): MaterialProps | null {
    const live = this.assetManager?.getMaterial(materialId)
    if (live) {
      const props = readMaterialProps(live)
      if (props) return props
    }
    const stored = this.materialStore.get(materialId)
    return stored ? { color: stored.color, roughness: stored.roughness, metalness: stored.metalness, opacity: stored.opacity, transparent: stored.transparent } : null
  }

  /** Live-preview a material edit (no history). Persists to the store so the viewport and asset agree. */
  private previewMaterialProps(materialId: string, props: MaterialProps): void {
    if (this.playing) return
    const live = this.assetManager?.getMaterial(materialId)
    if (live) applyMaterialProps(live, props)
    const stored = this.materialStore.get(materialId)
    if (stored) {
      this.materialStore.save({ ...stored, ...props })
    } else {
      this.materialStore.save({ id: materialId, name: materialId, ...props })
    }
  }

  private writeMaterialProps(materialId: string, props: MaterialProps): void {
    const live = this.assetManager?.getMaterial(materialId)
    if (live) applyMaterialProps(live, props)
    const stored = this.materialStore.get(materialId)
    if (stored) {
      this.materialStore.save({ ...stored, ...props })
    } else {
      this.materialStore.save({ id: materialId, name: materialId, ...props })
    }
    this.assetBrowser.refresh()
  }

  private recordMaterialPropChange(entityId: number, materialId: string, before: MaterialProps, after: MaterialProps): void {
    if (this.playing || materialPropsEqual(before, after)) return
    const beforeCopy = cloneMaterialProps(before)
    const afterCopy = cloneMaterialProps(after)
    this.writeMaterialProps(materialId, afterCopy)
    this.history.execute({
      description: 'Change Material',
      undo: () => {
        this.writeMaterialProps(materialId, beforeCopy)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
      },
      redo: () => {
        this.writeMaterialProps(materialId, afterCopy)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
      },
    })
  }

  private setEntityMaterial(entityId: number, materialId: string): void {
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const meshRenderer = entity?.getComponent<MeshRendererComponent>('meshRenderer')
    if (meshRenderer) meshRenderer.materialId = materialId
  }

  private recordMaterialAssign(entityId: number, beforeId: string, afterId: string): void {
    if (this.playing || beforeId === afterId) return
    this.setEntityMaterial(entityId, afterId)
    this.markSceneDirty()
    this.syncViewportSystems()
    this.renderInspectorForSelection()
    this.update()
    this.history.execute({
      description: 'Assign Material',
      undo: () => {
        this.setEntityMaterial(entityId, beforeId)
        this.syncViewportSystems()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        this.setEntityMaterial(entityId, afterId)
        this.syncViewportSystems()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private async createMaterialForEntity(entityId: number): Promise<void> {
    if (this.playing || this.editingPrefab !== null || !this.assetManager) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    const meshRenderer = entity?.getComponent<MeshRendererComponent>('meshRenderer')
    if (!entity || !meshRenderer) return
    const name = await showPromptDialog(this.root, {
      title: 'New Material',
      label: 'Material name',
      initialValue: 'New Material',
      confirmText: 'Create',
      validate: (value) => {
        if (!value) return 'Enter a material name.'
        if (value.includes('/') || value.includes('\\')) return 'Name must not contain slashes.'
        return null
      },
    })
    if (name === null || this.playing || this.editingPrefab !== null) return
    const target = scene.getEntity(entityId)?.getComponent<MeshRendererComponent>('meshRenderer')
    if (!target) return
    const previousId = target.materialId
    const base = this.readEditorMaterialProps(previousId) ?? { ...DEFAULT_MATERIAL_PROPS }
    const id = this.materialStore.allocateId(name)
    const def: MaterialDefinition = { id, name, ...cloneMaterialProps(base) }
    this.materialStore.save(def)
    this.assetManager.registerMaterial(id, createMaterialFromDefinition(def))
    target.materialId = id
    this.markSceneDirty()
    this.assetBrowser.refresh()
    this.syncViewportSystems()
    this.renderInspectorForSelection()
    this.update()
    this.status.textContent = `Created Material "${name}".`

    this.history.execute({
      description: `Create Material ${name}`,
      undo: () => {
        this.setEntityMaterial(entityId, previousId)
        this.assetManager?.removeMaterial(id)
        this.materialStore.remove(id)
        this.assetBrowser.refresh()
        this.syncViewportSystems()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        this.materialStore.save(def)
        this.assetManager?.registerMaterial(id, createMaterialFromDefinition(def))
        this.setEntityMaterial(entityId, id)
        this.assetBrowser.refresh()
        this.syncViewportSystems()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private resolveAssignTarget(): { id: number; name?: string; meshRenderer: MeshRendererComponent } | null {
    const scene = this.sceneManager.getActiveScene()
    const ids = [this.selectedEntityId, this.lastSelectedEntityId]
    for (const id of ids) {
      if (id === null) continue
      const entity = scene.getEntity(id)
      const meshRenderer = entity?.getComponent<MeshRendererComponent>('meshRenderer')
      if (entity && meshRenderer) return { id: entity.id, name: entity.name, meshRenderer }
    }
    return null
  }

  private assignMaterialFromBrowser(asset: AssetFileInfo): void {
    if (this.playing || this.editingPrefab !== null) return
    const materialId = materialIdFromAsset(asset)
    if (!materialId) return
    const target = this.resolveAssignTarget()
    if (!target) {
      this.status.textContent = 'Select a renderable entity to assign this material.'
      return
    }
    this.recordMaterialAssign(target.id, target.meshRenderer.materialId, materialId)
    this.selectionState.select(target.id)
  }

  /**
   * Register stored material definitions into the AssetManager and re-apply
   * stored overrides (e.g. for freshly loaded GLTF materials). Called at
   * startup, after GLTF loads and on scene switches — never per frame, so
   * runtime material animation in Play Mode is left untouched.
   */
  syncMaterialAssets(): void {
    if (!this.assetManager) return
    for (const def of this.materialStore.list()) {
      const live = this.assetManager.getMaterial(def.id)
      if (!live) {
        this.assetManager.registerMaterial(def.id, createMaterialFromDefinition(def))
      } else {
        const current = readMaterialProps(live)
        const wanted: MaterialProps = { color: def.color, roughness: def.roughness, metalness: def.metalness, opacity: def.opacity, transparent: def.transparent }
        if (current && !materialPropsEqual(current, wanted)) {
          applyMaterialProps(live, wanted)
        }
      }
    }
    this.assetBrowser.refresh()
  }

  /** Called by the host after a GLTF asset load so stored overrides re-apply to fresh imports. */
  noteGLTFAssetLoaded(): void {
    if (this.playing) return
    this.syncMaterialAssets()
  }

  private restorePrePlayMaterials(): void {
    if (!this.assetManager || !this.prePlayMaterialIds || !this.prePlayMaterialProps) return
    const before = new Set(this.prePlayMaterialIds)
    for (const id of this.assetManager.listMaterialIds()) {
      if (!before.has(id)) this.assetManager.removeMaterial(id)
    }
    for (const [id, props] of this.prePlayMaterialProps) {
      if (!props) continue
      const live = this.assetManager.getMaterial(id)
      if (live) applyMaterialProps(live, props)
    }
    this.prePlayMaterialIds = null
    this.prePlayMaterialProps = null
  }

  private recordLightChange(
    entityId: number,
    componentType: LightComponentType,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): void {
    if (this.playing) return
    this.markSceneDirty()
    const label = lightComponentLabel(componentType)
    this.history.execute({
      description: `Change ${label}`,
      undo: () => {
        this.applyLightSnapshot(entityId, componentType, before)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        this.applyLightSnapshot(entityId, componentType, after)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private applyLightSnapshot(
    entityId: number,
    componentType: LightComponentType,
    snapshot: Record<string, unknown>,
  ): void {
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const component = entity?.getComponent(componentType) as Record<string, unknown> | undefined
    if (!component) return
    for (const [key, value] of Object.entries(snapshot)) {
      if (key === 'type') continue
      component[key] = cloneValue(value)
    }
    this.lightSystem?.sync()
  }

  private addLightComponent(entityId: number, componentType: LightComponentType): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    if (!entity || entity.hasComponent(componentType)) return

    entity.addComponent(createLightComponent(componentType))
    this.markSceneDirty()
    this.lightSystem?.sync()
    this.renderInspectorForSelection(entity)
    this.update()

    const label = lightComponentLabel(componentType)
    this.history.execute({
      description: `Add ${label}`,
      undo: () => {
        scene.getEntity(entityId)?.removeComponent(componentType)
        this.lightSystem?.sync()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        const target = scene.getEntity(entityId)
        if (target && !target.hasComponent(componentType)) {
          target.addComponent(createLightComponent(componentType))
        }
        this.lightSystem?.sync()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private removeLightComponent(entityId: number, componentType: LightComponentType): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    const existing = entity?.getComponent(componentType)
    if (!entity || !existing) return

    const saved = cloneComponent(existing)
    entity.removeComponent(componentType)
    this.markSceneDirty()
    this.lightSystem?.sync()
    this.renderInspectorForSelection(entity)
    this.update()

    const label = lightComponentLabel(componentType)
    this.history.execute({
      description: `Remove ${label}`,
      undo: () => {
        const target = scene.getEntity(entityId)
        if (target && !target.hasComponent(componentType)) {
          target.addComponent(cloneComponent(saved))
        }
        this.lightSystem?.sync()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        scene.getEntity(entityId)?.removeComponent(componentType)
        this.lightSystem?.sync()
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private recordAnimationChange(
    entityId: number,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): void {
    if (this.playing) return
    this.markSceneDirty()
    this.history.execute({
      description: 'Change Animation',
      undo: () => {
        this.applyAnimationSnapshot(entityId, before)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        this.applyAnimationSnapshot(entityId, after)
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private applyAnimationSnapshot(
    entityId: number,
    snapshot: Record<string, unknown>,
  ): void {
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const component = entity?.getComponent('animation') as Record<string, unknown> | undefined
    if (!component) return
    for (const [key, value] of Object.entries(snapshot)) {
      if (key === 'type') continue
      component[key] = cloneValue(value)
    }
  }

  private getAnimationClipsForEntity(entityId: number): string[] {
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const component = entity?.getComponent('animation') as
      | { assetId?: unknown; clips?: unknown; activeClip?: unknown }
      | undefined
    const clips: string[] = []
    if (component && Array.isArray(component.clips)) {
      for (const clip of component.clips) {
        if (typeof clip === 'string' && !clips.includes(clip)) clips.push(clip)
      }
    }
    const assetId = typeof component?.assetId === 'string' ? component.assetId : undefined
    const stored = assetId !== undefined ? this.assetManager?.getGLTFAsset(assetId) : undefined
    if (stored) {
      for (const clip of stored.animations) {
        if (!clips.includes(clip)) clips.push(clip)
      }
    }
    if (typeof component?.activeClip === 'string' && !clips.includes(component.activeClip)) {
      clips.push(component.activeClip)
    }
    return clips
  }

  private getAnimationSourceForEntity(entityId: number): { assetId: string; clips: string[] } | null {
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const meshRenderer = entity?.getComponent('meshRenderer') as { geometryId?: unknown } | undefined
    const geometryId = typeof meshRenderer?.geometryId === 'string' ? meshRenderer.geometryId : undefined
    if (!geometryId) return null
    const asset = this.assetManager?.getGLTFAssetForGeometry(geometryId)
    if (!asset || asset.animations.length === 0) return null
    return { assetId: asset.id, clips: [...asset.animations] }
  }

  private addAnimationComponent(entityId: number): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    if (!entity || entity.hasComponent('animation')) return
    const source = this.getAnimationSourceForEntity(entityId)
    if (!source) return

    entity.addComponent(createAnimation({
      assetId: source.assetId,
      clips: source.clips,
      activeClip: source.clips[0],
      playing: true,
      loop: true,
    }))
    this.markSceneDirty()
    this.renderInspectorForSelection(entity)
    this.update()

    this.history.execute({
      description: 'Add Animation',
      undo: () => {
        scene.getEntity(entityId)?.removeComponent('animation')
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        const target = scene.getEntity(entityId)
        const targetSource = this.getAnimationSourceForEntity(entityId)
        if (target && !target.hasComponent('animation') && targetSource) {
          target.addComponent(createAnimation({
            assetId: targetSource.assetId,
            clips: targetSource.clips,
            activeClip: targetSource.clips[0],
            playing: true,
            loop: true,
          }))
        }
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  private removeAnimationComponent(entityId: number): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    const existing = entity?.getComponent('animation')
    if (!entity || !existing) return

    const saved = cloneComponent(existing)
    entity.removeComponent('animation')
    this.markSceneDirty()
    this.renderInspectorForSelection(entity)
    this.update()

    this.history.execute({
      description: 'Remove Animation',
      undo: () => {
        const target = scene.getEntity(entityId)
        if (target && !target.hasComponent('animation')) {
          target.addComponent(cloneComponent(saved))
        }
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
      redo: () => {
        scene.getEntity(entityId)?.removeComponent('animation')
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.update()
      },
    })
  }

  /**
   * Editor preview transport: play/pause toggles the live flag without
   * history. The runtime AnimationSystem already updates in Edit Mode, so
   * the viewport previews immediately.
   */
  private previewToggleAnimation(entityId: number, playing: boolean): void {
    if (this.playing) return
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const component = entity?.getComponent('animation') as { playing?: unknown } | undefined
    if (!component) return
    component.playing = playing
    this.markSceneDirty()
  }

  /**
   * Editor preview Stop: pause and reset to the bind pose. History-free and
   * transform-safe — only the runtime mixer entry is discarded and rebuilt.
   */
  private stopAnimationPreview(entityId: number): void {
    if (this.playing) return
    const entity = this.sceneManager.getActiveScene().getEntity(entityId)
    const component = entity?.getComponent('animation') as { playing?: unknown } | undefined
    if (!component) return
    component.playing = false
    this.animationSystem?.resetPlayback(entityId)
    if (this.selectedEntityId === entityId) {
      this.renderInspectorForSelection()
    }
    this.update()
  }

  update(): void {    const scene = this.sceneManager.getActiveScene()
    const entities = scene.getAllEntities()

    if (scene !== this.activeScene) {
      this.activeScene = scene
      this.selectionState.select(null)
      this.hierarchySignature = ''
    }

    if (this.selectedEntityId !== null && !scene.getEntity(this.selectedEntityId)) {
      this.selectionState.select(null)
    }

    const signature = entities.map((entity) => `${entity.id}:${entity.name ?? ''}:${getParentId(scene, entity.id) ?? ''}`).join('|')
    if (signature !== this.hierarchySignature) {
      this.hierarchySignature = signature
      this.hierarchy.render(entities, this.selectedEntityId)
    }

    this.updateModifyMenuState()
    if (!this.playing) {
      this.status.textContent = `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`
    }

    if (!this.playing) {
      this.editorCamera.update()
      this.colliderVisualizer.update()
      this.lightVisualizer.update()
      this.selectionHighlight.update()
      this.gizmo.update()
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('beforeunload', this.onBeforeUnload)
    document.removeEventListener('pointerdown', this.onDocumentPointerDown)
    this.canvas.removeEventListener('dragover', this.onCanvasDragOver)
    this.canvas.removeEventListener('drop', this.onCanvasDrop)
    this.unsubscribeSelection()
    this.picker.dispose()
    this.gizmo.dispose()
    this.selectionHighlight.dispose()
    this.colliderVisualizer.dispose()
    this.lightVisualizer.dispose()
    this.grid.dispose()
    this.editorCamera.dispose()
    this.selectionState.clear()
    this.history.clear()
    this.hierarchy.dispose()
    this.inspector.dispose()
    this.assetBrowser.dispose()
    this.root.remove()
  }

  private selectAsset(asset: AssetFileInfo | null): void {
    this.selectedAsset = asset
    if (asset === null) {
      if (this.selectedEntityId === null) {
        this.inspector.render(null)
      }
      return
    }
    if (this.selectedEntityId !== null) {
      this.selectionState.select(null)
    }
    this.showSelectedAsset(!this.playing && this.editingPrefab === null)
  }

  private showSelectedAsset(canEditScene: boolean): void {
    const asset = this.selectedAsset
    if (!asset) return
    if (asset.kind === 'scene') {      const name = sceneNameFromAsset(asset)
      const stored = name ? this.sceneStore.get(name) : undefined
      this.inspector.renderScene(asset, {
        name: name ?? asset.fileName,
        source: asset.url ? 'Scene file' : 'Local scene store',
        entityCount: stored ? stored.entities.length : null,
      }, {
        canOpen: canEditScene,
        onOpen: (target) => {
          void this.openSceneAsset(target)
        },
      })
      return
    }
    if (asset.kind === 'prefab') {
      const name = prefabNameFromAsset(asset)
      const record = name ? this.prefabStore.get(name) : undefined
      if (!name || !record) {
        this.inspector.render(null)
        return
      }
      this.inspector.renderPrefab(
        {
          name,
          entityName: record.entityName?.trim() || name,
          componentCount: Object.keys(record.components).length,
        },
        {
          canInstantiate: canEditScene,
          canEdit: canEditScene,
          onInstantiate: (target) => this.instantiatePrefab(target),
          onEdit: (target) => this.startPrefabEdit(target),
        },
      )
      return
    }
    if (asset.kind === 'material') {
      const materialId = materialIdFromAsset(asset)
      const stored = materialId ? this.materialStore.get(materialId) : undefined
      const liveProps = materialId ? this.readEditorMaterialProps(materialId) : null
      const target = this.resolveAssignTarget()
      if (!materialId || (!stored && !liveProps)) {
        this.inspector.render(null)
        return
      }
      this.inspector.renderMaterialAsset(asset, {
        id: materialId,
        name: stored?.name ?? materialId,
        props: liveProps ?? (stored ? { ...stored } : null),
      }, {
        canAssign: canEditScene && target !== null,
        assignLabel: target ? `Assign to ${target.name ?? `Entity ${target.id}`}` : 'Assign to Selected Entity',
        onAssign: (id) => {
          if (target) this.recordMaterialAssign(target.id, target.meshRenderer.materialId, id)
        },
      })
      return
    }
    this.inspector.renderAsset(asset, {
      canInstantiate: canEditScene && asset.kind === 'model' && this.assetManager !== undefined,
      onInstantiate: (target) => {
        void this.instantiateAsset(target)
      },
    })
  }

  private async instantiateAsset(asset: AssetFileInfo): Promise<void> {
    if (this.playing || this.editingPrefab !== null || asset.kind !== 'model' || !this.assetManager) return
    const manager = this.assetManager
    const assetId = assetIdForFile(asset)

    let result = manager.getGLTFAsset(assetId)
    if (!result) {
      const pending = this.pendingGLTFLoads.get(assetId)
      if (pending) {
        try {
          result = await pending
        } catch {
          return
        }
      } else {
        const load = manager.loadGLTF(assetId, asset.url)
        this.pendingGLTFLoads.set(assetId, load)
        this.status.textContent = `Loading ${asset.fileName}…`
        try {
          result = await load
        } catch (error) {
          console.error(`[Editor] Failed to instantiate "${asset.relativePath}":`, error)
          this.status.textContent = `Failed to load ${asset.fileName}`
          return
        } finally {
          this.pendingGLTFLoads.delete(assetId)
        }
      }
    }
    if (this.playing || !result || result.meshes.length === 0) return
    this.syncMaterialAssets()

    const scene = this.sceneManager.getActiveScene()
    const focus = this.editorCamera.getTarget()
    const baseName = asset.fileName.replace(/\.[^.]+$/, '') || asset.fileName
    const offset = (this.spawnCount % 5) * 0.5
    this.spawnCount += 1
    const position = { x: focus.x + offset, y: focus.y, z: focus.z }

    // One entity per file, mirroring the demo workflow: the first mesh carries
    // the MeshRenderer while the animation root (when clips exist) carries the
    // full multi-mesh hierarchy and clip playback.
    const mesh = result.meshes[0]
    this.markSceneDirty()
    const entity = scene.createEntity()
    entity.name = baseName
    entity.addComponent(createTransform({ x: position.x, y: position.y, z: position.z }))
    entity.addComponent(createMeshRenderer({ geometryId: mesh.geometryId, materialId: mesh.materialId }))
    if (result.animations.length > 0) {
      entity.addComponent(createAnimation({
        assetId: result.id,
        clips: [...result.animations],
        activeClip: result.animations[0],
        playing: true,
        loop: true,
      }))
    }
    const createdId = entity.id
    const createdName = entity.name ?? `Entity ${entity.id}`
    const createdComponents = entity.getAllComponents().map((c) => cloneComponent(c))

    this.selectedAsset = null
    this.assetBrowser.clearSelection()
    this.selectionState.select(createdId)
    this.hierarchySignature = ''
    this.syncViewportSystems()
    this.update()

    this.history.execute({
      description: `Add ${createdName}`,
      undo: () => {
        scene.destroyEntity(createdId)
        if (this.selectedEntityId === createdId) {
          this.selectionState.select(null)
        }
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.update()
      },
      redo: () => {
        if (!scene.getEntity(createdId)) {
          const recreated = (scene as any).createEntityWithId(createdId, { name: createdName }) as Entity
          for (const comp of createdComponents) {
            recreated.addComponent(cloneComponent(comp))
          }
        }
        this.selectedAsset = null
        this.assetBrowser.clearSelection()
        this.selectionState.select(createdId)
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.update()
      },
    })
  }

  isEditingPrefab(): boolean {
    return this.editingPrefab !== null
  }

  private async createPrefabFromEntity(entity: Entity): Promise<void> {
    if (this.playing || this.editingPrefab !== null) return
    const scene = this.sceneManager.getActiveScene()
    if (!scene.getEntity(entity.id)) return
    const fallback = entity.name?.trim() || `Entity ${entity.id}`
    const name = await showPromptDialog(this.root, {
      title: 'Save as Prefab',
      label: 'Prefab name',
      initialValue: fallback,
      confirmText: 'Next',
      validate: (value) => {
        if (!value) return 'Enter a prefab name.'
        if (value.includes('/') || value.includes('\\')) return 'Name must not contain slashes.'
        return null
      },
    })
    if (name === null || this.playing || this.editingPrefab !== null) return
    const source = scene.getEntity(entity.id)
    if (!source) return
    const sourceName = source.name?.trim() || `Entity ${source.id}`
    const exists = this.prefabStore.has(name)
    const confirmed = await showConfirmDialog(this.root, exists
      ? {
        title: 'Overwrite Prefab',
        message: `Prefab "${name}" already exists. Overwrite it with the current "${sourceName}" entity?`,
        confirmText: 'Overwrite',
        danger: true,
      }
      : {
        title: 'Save Prefab',
        message: `Save entity "${sourceName}" as prefab "${name}"?`,
        confirmText: 'Save',
      })
    if (!confirmed || this.playing || this.editingPrefab !== null) return
    const latest = scene.getEntity(entity.id)
    if (!latest) return
    const record = PrefabStore.entityToData(latest, name)
    this.prefabStore.save(record)
    this.assetBrowser.refresh()
    this.toggleAssetBrowser(true)
    this.assetBrowser.navigateTo(PREFAB_FOLDER)
    this.selectAsset(this.assetBrowser.selectByPath(prefabAssetForName(name).relativePath))
    this.update()

    this.history.execute({
      description: `Create Prefab ${name}`,
      undo: () => {
        this.prefabStore.remove(name)
        this.assetBrowser.refresh()
        this.update()
      },
      redo: () => {
        this.prefabStore.save(record)
        this.assetBrowser.refresh()
        this.update()
      },
    })
    this.status.textContent = `Saved Prefab "${name}".`
  }

  private instantiatePrefab(name: string): void {
    if (this.playing || this.editingPrefab !== null) return
    const record = this.prefabStore.get(name)
    const prefab = this.prefabStore.toPrefab(name)
    if (!record || !prefab) {
      this.status.textContent = `Prefab "${name}" not found.`
      return
    }
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.instantiate(prefab)
    this.markSceneDirty()
    entity.name = this.uniqueEntityName(record.entityName?.trim() || name)
    const transform = entity.getComponent<TransformComponent>('transform')
    if (transform) {
      transform.position.x += (this.spawnCount % 5) * 0.5
    }
    this.spawnCount += 1
    const createdId = entity.id
    const createdName = entity.name ?? `Entity ${entity.id}`
    const createdComponents = entity.getAllComponents().map((c) => cloneComponent(c))

    this.selectedAsset = null
    this.assetBrowser.clearSelection()
    this.selectionState.select(createdId)
    this.hierarchySignature = ''
    this.syncViewportSystems()
    this.update()

    this.history.execute({
      description: `Add ${createdName}`,
      undo: () => {
        scene.destroyEntity(createdId)
        if (this.selectedEntityId === createdId) {
          this.selectionState.select(null)
        }
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.update()
      },
      redo: () => {
        if (!scene.getEntity(createdId)) {
          const recreated = (scene as any).createEntityWithId(createdId, { name: createdName }) as Entity
          for (const comp of createdComponents) {
            recreated.addComponent(cloneComponent(comp))
          }
        }
        this.selectedAsset = null
        this.assetBrowser.clearSelection()
        this.selectionState.select(createdId)
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.update()
      },
    })
  }

  private uniqueEntityName(base: string): string {
    const scene = this.sceneManager.getActiveScene()
    if (!scene.findByName(base)) return base
    let index = 2
    while (scene.findByName(`${base} ${index}`)) {
      index += 1
    }
    return `${base} ${index}`
  }

  private startPrefabEdit(name: string): void {
    if (this.playing || this.editingPrefab !== null) return
    const record = this.prefabStore.get(name)
    const prefab = this.prefabStore.toPrefab(name)
    if (!record || !prefab) {
      this.status.textContent = `Prefab "${name}" not found.`
      return
    }
    const scene = this.sceneManager.getActiveScene()
    const entitySnapshot = new Map<number, { metadata: EntityMetadata; components: Component[] }>()
    for (const entity of scene.getAllEntities()) {
      entitySnapshot.set(entity.id, {
        metadata: { name: entity.name, tag: entity.tag },
        components: entity.getAllComponents().map((c) => cloneComponent(c)),
      })
    }
    this.preEditSnapshot = {
      sceneData: scene.serialize(),
      entitySnapshot,
      selectedEntityId: this.selectedEntityId,
      selectedAssetPath: this.selectedAsset?.relativePath ?? null,
    }

    this.history.clear()
    this.selectedAsset = null
    this.assetBrowser.clearSelection()
    this.selectionState.select(null)
    scene.deserialize({ entities: [] })
    const entity = scene.instantiate(prefab)
    entity.name = record.entityName?.trim() || name
    this.editingPrefab = name
    this.editingEntityId = entity.id
    this.selectionState.select(entity.id)
    this.hierarchySignature = ''
    this.animationSystem?.clear()
    this.syncViewportSystems()

    this.root.classList.add('is-prefab-editing')
    this.titlebarMeta.textContent = `PREFAB · ${name}`
    this.savePrefabButton.hidden = false
    this.cancelPrefabButton.hidden = false
    this.createButton.disabled = true
    this.updateModifyMenuState()
    this.playButton.disabled = true
    this.newSceneButton.disabled = true
    this.saveSceneButton.disabled = true
    this.saveSceneAsButton.disabled = true
    this.assetBrowser.setDisabled(true)
    this.updateHistoryButtons()
    this.update()
  }

  private savePrefabEdits(): void {
    if (!this.editingPrefab || this.editingEntityId === null) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(this.editingEntityId)
    if (!entity) {
      this.status.textContent = 'Cannot save: the prefab entity was deleted. Undo the delete or Cancel.'
      return
    }
    const name = this.editingPrefab
    this.prefabStore.save(PrefabStore.entityToData(entity, name))
    this.exitPrefabEdit()
    this.status.textContent = `Saved Prefab "${name}".`
  }

  private cancelPrefabEdit(): void {
    if (!this.editingPrefab) return
    this.exitPrefabEdit()
  }

  private exitPrefabEdit(): void {
    const snapshot = this.preEditSnapshot
    if (!this.editingPrefab || !snapshot) return
    const scene = this.sceneManager.getActiveScene()

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

    this.editingPrefab = null
    this.editingEntityId = null
    this.preEditSnapshot = null
    this.history.clear()
    this.animationSystem?.clear()
    this.syncViewportSystems()

    this.root.classList.remove('is-prefab-editing')
    this.titlebarMeta.textContent = 'WebGL'
    this.savePrefabButton.hidden = true
    this.cancelPrefabButton.hidden = true
    this.playButton.disabled = false
    this.createButton.disabled = false
    this.newSceneButton.disabled = false
    this.saveSceneButton.disabled = false
    this.saveSceneAsButton.disabled = false
    this.updateModifyMenuState()
    this.assetBrowser.setDisabled(false)
    this.assetBrowser.refresh()

    this.selectionState.select(null)
    if (snapshot.selectedEntityId !== null && scene.getEntity(snapshot.selectedEntityId)) {
      this.selectionState.select(snapshot.selectedEntityId)
    } else if (snapshot.selectedAssetPath) {
      this.selectAsset(this.assetBrowser.selectByPath(snapshot.selectedAssetPath))
    }
    this.updateHistoryButtons()
    this.hierarchySignature = ''
    this.update()
  }

  getSceneName(): string | null {
    return this.sceneName
  }

  isSceneDirty(): boolean {
    return this.sceneDirty
  }

  private refreshSceneTitle(): void {
    this.sceneTitle.textContent = `${this.sceneName ?? 'Untitled Scene'}${this.sceneDirty ? ' •' : ''}`
  }

  private markSceneDirty(): void {
    this.sceneDirty = true
    this.refreshSceneTitle()
  }

  saveScene(): void {
    if (this.playing || this.editingPrefab !== null) return
    if (!this.sceneName) {
      void this.saveSceneAs()
      return
    }
    this.sceneStore.save(this.sceneName, this.sceneManager.getActiveScene().serialize())
    this.sceneDirty = false
    this.refreshSceneTitle()
    this.assetBrowser.refresh()
    this.status.textContent = `Saved Scene "${this.sceneName}".`
  }

  private async saveSceneAs(): Promise<boolean> {
    if (this.playing || this.editingPrefab !== null) return false
    const name = await showPromptDialog(this.root, {
      title: 'Save Scene As',
      label: 'Scene name',
      initialValue: this.sceneName ?? 'Untitled',
      confirmText: 'Save',
      validate: (value) => {
        if (!value) return 'Enter a scene name.'
        if (value.includes('/') || value.includes('\\')) return 'Name must not contain slashes.'
        return null
      },
    })
    if (name === null || this.playing || this.editingPrefab !== null) return false
    if (this.sceneStore.has(name) && !(await showConfirmDialog(this.root, {
      title: 'Overwrite Scene',
      message: `Scene "${name}" already exists. Overwrite it?`,
      confirmText: 'Overwrite',
      danger: true,
    }))) {
      return false
    }
    if (this.playing || this.editingPrefab !== null) return false
    this.sceneStore.save(name, this.sceneManager.getActiveScene().serialize())
    this.sceneName = name
    this.sceneDirty = false
    this.refreshSceneTitle()
    this.assetBrowser.refresh()
    this.status.textContent = `Saved Scene "${name}".`
    return true
  }

  private async confirmDiscardChanges(): Promise<'save' | 'discard' | 'cancel'> {
    if (!this.sceneDirty) return 'discard'
    const choice = await showOptionsDialog(this.root, {
      title: 'Unsaved Changes',
      message: `Scene "${this.sceneName ?? 'Untitled Scene'}" has unsaved changes. Save them?`,
      actions: [
        { id: 'save', label: 'Save', primary: true },
        { id: 'discard', label: "Don't Save" },
        { id: 'cancel', label: 'Cancel' },
      ],
    })
    if (choice === 'save') {
      if (this.sceneName) {
        this.saveScene()
        return 'save'
      }
      return (await this.saveSceneAs()) ? 'save' : 'cancel'
    }
    return choice === 'discard' ? 'discard' : 'cancel'
  }

  private async openSceneAsset(asset: AssetFileInfo): Promise<void> {
    if (this.playing || this.editingPrefab !== null) return
    const data = await this.resolveSceneData(asset)
    if (!data) return
    if ((await this.confirmDiscardChanges()) === 'cancel') return
    if (this.playing || this.editingPrefab !== null) return
    const name = sceneNameFromAsset(asset) ?? asset.fileName.replace(/\.scene$/i, '') ?? asset.fileName
    this.replaceScene(data, asset.url ? null : name)
  }

  private async resolveSceneData(asset: AssetFileInfo): Promise<SceneData | null> {
    if (asset.url) {
      try {
        const response = await fetch(asset.url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json() as unknown
        if (!isSceneDataLike(data)) throw new Error('Not a scene file')
        return data
      } catch (error) {
        console.error(`[Editor] Failed to open scene "${asset.relativePath}":`, error)
        this.status.textContent = `Failed to open ${asset.fileName}`
        return null
      }
    }
    const name = sceneNameFromAsset(asset)
    const data = name ? this.sceneStore.get(name) : undefined
    if (!data) {
      this.status.textContent = `Scene "${asset.fileName}" not found.`
      return null
    }
    return data
  }

  private replaceScene(data: SceneData, name: string | null): void {
    const scene = this.sceneManager.getActiveScene()
    this.selectedAsset = null
    this.assetBrowser.clearSelection()
    this.selectionState.select(null)
    this.history.clear()
    scene.deserialize(data)
    this.sceneName = name
    this.sceneDirty = false
    this.refreshSceneTitle()
    this.hierarchySignature = ''
    this.animationSystem?.clear()
    this.syncMaterialAssets()
    this.syncViewportSystems()
    this.updateHistoryButtons()
    this.update()
  }

  private async newScene(): Promise<void> {
    if (this.playing || this.editingPrefab !== null) return
    if ((await this.confirmDiscardChanges()) === 'cancel') return
    if (this.playing || this.editingPrefab !== null) return
    const scene = this.sceneManager.getActiveScene()
    this.selectedAsset = null
    this.assetBrowser.clearSelection()
    this.selectionState.select(null)
    this.history.clear()
    scene.deserialize({ entities: [] })
    this.sceneName = null
    this.sceneDirty = true
    this.refreshSceneTitle()
    this.hierarchySignature = ''
    this.animationSystem?.clear()
    this.syncViewportSystems()
    this.updateHistoryButtons()
    this.update()
  }

  private ensureBuiltinGeometry(): void {
    if (!this.assetManager) return
    if (!this.assetManager.hasGeometry('builtin/cube')) {
      this.assetManager.registerGeometry('builtin/cube', new BoxGeometry(1, 1, 1))
    }
    if (!this.assetManager.hasGeometry('builtin/sphere')) {
      this.assetManager.registerGeometry('builtin/sphere', new SphereGeometry(0.5, 32, 16))
    }
  }

  private defaultEditorMaterialId(): string {
    this.syncMaterialAssets()
    if (this.assetManager?.hasMaterial('material/default')) return 'material/default'
    return this.materialStore.list()[0]?.id ?? 'material/default'
  }

  private createEntity(kind: CreateEntityKind = 'empty'): void {
    if (this.playing || this.editingPrefab !== null) return

    const scene = this.sceneManager.getActiveScene()
    const entity = scene.createEntity()
    const entityId = entity.id
    if (kind === 'cube' || kind === 'sphere') {
      this.ensureBuiltinGeometry()
      entity.name = this.uniqueEntityName(kind === 'cube' ? 'Cube' : 'Sphere')
      entity.addComponent(createTransform())
      entity.addComponent(createMeshRenderer({
        geometryId: kind === 'cube' ? 'builtin/cube' : 'builtin/sphere',
        materialId: this.defaultEditorMaterialId(),
      }))
    } else if (kind === 'directionalLight' || kind === 'pointLight' || kind === 'spotLight') {
      const lightType: LightComponentType = kind
      entity.name = this.uniqueEntityName(lightComponentLabel(lightType))
      entity.addComponent(createTransform())
      entity.addComponent(createLightComponent(lightType))
    } else {
      entity.name = `Entity ${entity.id}`
    }
    const entityName = entity.name ?? `Entity ${entityId}`
    const createdComponents = entity.getAllComponents().map((c) => cloneComponent(c))
    this.selectionState.select(entityId)
    this.markSceneDirty()
    this.syncViewportSystems()
    this.hierarchySignature = ''
    this.update()

    this.history.execute({
      description: `Create ${entityName}`,
      undo: () => {
        scene.destroyEntity(entityId)
        if (this.selectedEntityId === entityId) {
          this.selectionState.select(null)
        }
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.lightSystem?.sync()
        this.update()
      },
      redo: () => {
        if (!scene.getEntity(entityId)) {
          const recreated = (scene as any).createEntityWithId(entityId, { name: entityName }) as Entity
          for (const comp of createdComponents) {
            recreated.addComponent(cloneComponent(comp))
          }
        }
        this.selectionState.select(entityId)
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.lightSystem?.sync()
        this.update()
      },
    })
  }

  private renameEntity(entityId: number, newName: string): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const entity = scene.getEntity(entityId)
    if (!entity) return
    const trimmed = newName.trim()
    const next = trimmed.length === 0 ? undefined : trimmed
    const before = entity.name
    if (before === next) return

    entity.name = next
    this.markSceneDirty()
    if (this.selectedEntityId !== entityId) {
      this.selectionState.select(entityId)
    } else {
      this.renderInspectorForSelection()
    }
    this.hierarchySignature = ''
    this.update()

    this.history.execute({
      description: `Rename to ${next ?? `Entity ${entityId}`}`,
      undo: () => {
        const target = scene.getEntity(entityId)
        if (target) target.name = before
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.hierarchySignature = ''
        this.update()
      },
      redo: () => {
        const target = scene.getEntity(entityId)
        if (target) target.name = next
        if (this.selectedEntityId !== entityId) {
          this.selectionState.select(entityId)
        } else {
          this.renderInspectorForSelection()
        }
        this.hierarchySignature = ''
        this.update()
      },
    })
  }

  private reparentEntity(childId: number, newParentId: number | null): void {
    if (this.playing) return
    const scene = this.sceneManager.getActiveScene()
    const check = canReparent(scene, childId, newParentId)
    if (!check.ok) {
      this.status.textContent = check.reason === 'self-parent'
        ? 'Cannot parent an entity to itself.'
        : check.reason === 'descendant-parent'
          ? 'Cannot parent an entity under its own descendant.'
          : 'Cannot reparent: unknown entity.'
      return
    }
    if (getParentId(scene, childId) === newParentId) return
    const child = scene.getEntity(childId)
    if (!child) return

    const beforeTransform = child.getComponent<TransformComponent>('transform')
    const beforeLocal: TransformData | null = beforeTransform
      ? {
        position: { ...beforeTransform.position },
        rotation: { ...beforeTransform.rotation },
        scale: { ...beforeTransform.scale },
      }
      : null
    const beforeParent = getParentId(scene, childId)
    const afterLocal = computePreservedLocal(scene, childId, newParentId)

    this.applyReparentState(childId, newParentId, afterLocal)
    this.markSceneDirty()

    const childName = scene.getEntity(childId)?.name?.trim() || `Entity ${childId}`
    this.history.execute({
      description: `Reparent ${childName}`,
      undo: () => {
        this.applyReparentState(childId, beforeParent, beforeLocal)
      },
      redo: () => {
        this.applyReparentState(childId, newParentId, afterLocal)
      },
    })
  }

  private applyReparentState(childId: number, parentId: number | null, local: TransformData | null): void {
    const scene = this.sceneManager.getActiveScene()
    const child = scene.getEntity(childId)
    if (!child) return
    applyParentLink(child, parentId)
    if (local) {
      let transform = child.getComponent<TransformComponent>('transform')
      if (!transform) {
        transform = createTransform()
        child.addComponent(transform)
      }
      transform.position.x = local.position.x
      transform.position.y = local.position.y
      transform.position.z = local.position.z
      transform.rotation.x = local.rotation.x
      transform.rotation.y = local.rotation.y
      transform.rotation.z = local.rotation.z
      transform.scale.x = local.scale.x
      transform.scale.y = local.scale.y
      transform.scale.z = local.scale.z
    } else {
      child.removeComponent('transform')
    }
    if (this.selectedEntityId !== childId) {
      this.selectionState.select(childId)
    } else {
      this.renderInspectorForSelection()
    }
    this.hierarchySignature = ''
    this.syncViewportSystems()
    this.update()
  }

  private duplicateSelectedEntity(): void {
    if (this.playing || this.editingPrefab !== null || this.selectedEntityId === null) return
    const scene = this.sceneManager.getActiveScene()
    const sourceId = this.selectedEntityId
    if (!scene.getEntity(sourceId)) return

    const result = duplicateEntitySubtree(scene, sourceId, (base) => this.uniqueEntityName(base))
    if (!result) return
    const duplicatedIds = result.records.map((record) => record.id)
    const duplicatedRootId = result.rootId

    this.markSceneDirty()
    this.selectionState.select(duplicatedRootId)
    this.hierarchySignature = ''
    this.syncViewportSystems()
    this.update()

    this.history.execute({
      description: 'Duplicate Entity',
      undo: () => {
        destroyDuplicatedEntities(scene, duplicatedIds)
        if (scene.getEntity(sourceId)) {
          this.selectionState.select(sourceId)
        } else if (this.selectedEntityId !== null && duplicatedIds.includes(this.selectedEntityId)) {
          this.selectionState.select(null)
        }
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.update()
      },
      redo: () => {
        restoreDuplicatedEntities(scene, result.records)
        this.selectionState.select(duplicatedRootId)
        this.hierarchySignature = ''
        this.syncViewportSystems()
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
    this.markSceneDirty()
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
        this.syncViewportSystems()
        this.update()
      },
      redo: () => {
        scene.destroyEntity(idToDelete)
        if (this.selectedEntityId === idToDelete) {
          this.selectionState.select(null)
        }
        this.hierarchySignature = ''
        this.syncViewportSystems()
        this.update()
      },
    })
  }
}

function physicsComponentLabel(componentType: PhysicsComponentType): string {
  switch (componentType) {
    case 'rigidBody':
      return 'Rigid Body'
    case 'boxCollider':
      return 'Box Collider'
    case 'sphereCollider':
      return 'Sphere Collider'
  }
}

function lightComponentLabel(componentType: LightComponentType): string {
  switch (componentType) {
    case 'directionalLight':
      return 'Directional Light'
    case 'pointLight':
      return 'Point Light'
    case 'spotLight':
      return 'Spot Light'
  }
}

function createPhysicsComponent(
  componentType: PhysicsComponentType,
): RigidBodyComponent | BoxColliderComponent | SphereColliderComponent {
  switch (componentType) {
    case 'rigidBody':
      return createRigidBody()
    case 'boxCollider':
      return createBoxCollider()
    case 'sphereCollider':
      return createSphereCollider()
  }
}

import type { Entity, TransformComponent, Vec3 } from '../engine/index.ts'
import { transformsEqual, type TransformData } from './EditorHistory.ts'
import type { AssetFileInfo } from './AssetBrowser.ts'

export interface InspectorPanelOptions {
  onTransformCommit?: (entityId: number, before: TransformData, after: TransformData) => void
}

export interface InspectorAssetViewOptions {
  canInstantiate: boolean
  onInstantiate?: (asset: AssetFileInfo) => void
}

export interface InspectorEntityViewOptions {
  canSaveAsPrefab?: boolean
  onSaveAsPrefab?: (entity: Entity) => void
}

export interface InspectorPrefabData {
  name: string
  entityName: string
  componentCount: number
}

export interface InspectorPrefabViewOptions {
  canInstantiate: boolean
  canEdit: boolean
  onInstantiate?: (name: string) => void
  onEdit?: (name: string) => void
}

export interface InspectorSceneData {
  name: string
  source: string
  entityCount: number | null
}

export interface InspectorSceneViewOptions {
  canOpen: boolean
  onOpen?: (scene: AssetFileInfo) => void
}

/** Inspector for entity components and selected asset/prefab/scene info. */
export class InspectorPanel {
  readonly element: HTMLElement
  private readonly options: InspectorPanelOptions
  private readonly currentInputs = new Map<string, HTMLInputElement>()
  private currentEntity: Entity | null = null

  constructor(options: InspectorPanelOptions = {}) {
    this.options = options
    this.element = document.createElement('aside')
    this.element.className = 'trion-editor-panel trion-editor-inspector'
  }

  render(entity: Entity | null, view: InspectorEntityViewOptions = {}): void {
    this.currentEntity = entity
    this.currentInputs.clear()
    this.element.replaceChildren()
    this.appendHeader()
    if (!entity) {
      this.appendMessage('Select an entity in the hierarchy.')
      return
    }
    const title = document.createElement('div')
    title.className = 'trion-editor-entity-title'
    const name = document.createElement('div')
    name.className = 'trion-editor-entity-name'
    name.textContent = entity.name?.trim() || `Entity ${entity.id}`
    const metadata = document.createElement('div')
    metadata.className = 'trion-editor-entity-metadata'
    metadata.textContent = `Entity ID ${entity.id}`
    title.append(name, metadata)
    this.element.appendChild(title)
    if (view.canSaveAsPrefab) {
      const section = document.createElement('section')
      section.className = 'trion-editor-component'
      const heading = document.createElement('h2')
      heading.textContent = 'Prefab'
      section.appendChild(heading)
      const action = document.createElement('button')
      action.type = 'button'
      action.className = 'trion-editor-button'
      action.textContent = 'Save as Prefab'
      action.addEventListener('click', () => view.onSaveAsPrefab?.(entity))
      const row = document.createElement('div')
      row.className = 'trion-editor-asset-action'
      row.appendChild(action)
      section.appendChild(row)
      this.element.appendChild(section)
    }
    const transform = entity.getComponent<TransformComponent>('transform')
    if (!transform) {
      this.appendMessage('No editable components on this entity.')
      return
    }
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Transform'
    section.appendChild(heading)
    section.append(
      this.createVectorFields('Position', transform.position),
      this.createVectorFields('Rotation', transform.rotation),
      this.createVectorFields('Scale', transform.scale),
    )
    this.element.appendChild(section)
  }

  syncValues(transform: TransformComponent): void {
    const fields = [
      { prefix: 'position', vec: transform.position },
      { prefix: 'rotation', vec: transform.rotation },
      { prefix: 'scale', vec: transform.scale },
    ]
    for (const { prefix, vec } of fields) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const input = this.currentInputs.get(`${prefix}.${axis}`)
        if (input && document.activeElement !== input) {
          const val = Number(vec[axis])
          input.value = String(Number(val.toFixed(3)))
        }
      }
    }
  }

  dispose(): void {
    this.currentInputs.clear()
    this.element.remove()
  }

  renderAsset(asset: AssetFileInfo, view: InspectorAssetViewOptions): void {
    this.currentEntity = null
    this.currentInputs.clear()
    this.element.replaceChildren()
    this.appendHeader()

    const title = document.createElement('div')
    title.className = 'trion-editor-entity-title'
    const name = document.createElement('div')
    name.className = 'trion-editor-entity-name'
    name.textContent = asset.fileName
    const metadata = document.createElement('div')
    metadata.className = 'trion-editor-entity-metadata'
    metadata.textContent = asset.relativePath
    title.append(name, metadata)
    this.element.appendChild(title)

    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Asset'
    section.appendChild(heading)
    section.append(
      this.createAssetRow('File', asset.fileName),
      this.createAssetRow('Type', asset.kind === 'model' ? `3D Model (.${asset.extension})` : asset.kind === 'texture' ? `Texture (.${asset.extension})` : `Data (.${asset.extension})`),
      this.createAssetRow('Path', asset.relativePath),
    )
    this.element.appendChild(section)

    if (asset.kind === 'model') {
      const hint = document.createElement('p')
      hint.className = 'trion-editor-asset-hint'
      hint.textContent = view.canInstantiate
        ? 'Double-click or drag into the viewport to add to the scene.'
        : 'Scene editing is currently disabled.'
      this.element.appendChild(hint)
      const action = document.createElement('button')
      action.type = 'button'
      action.className = 'trion-editor-button is-primary'
      action.textContent = 'Add to Scene'
      action.disabled = !view.canInstantiate
      action.addEventListener('click', () => view.onInstantiate?.(asset))
      const row = document.createElement('div')
      row.className = 'trion-editor-asset-action'
      row.appendChild(action)
      this.element.appendChild(row)
    }
  }

  renderPrefab(data: InspectorPrefabData, view: InspectorPrefabViewOptions): void {
    this.currentEntity = null
    this.currentInputs.clear()
    this.element.replaceChildren()
    this.appendHeader()

    const title = document.createElement('div')
    title.className = 'trion-editor-entity-title'
    const name = document.createElement('div')
    name.className = 'trion-editor-entity-name'
    name.textContent = `${data.name}.prefab`
    const metadata = document.createElement('div')
    metadata.className = 'trion-editor-entity-metadata'
    metadata.textContent = `Prefabs/${data.name}.prefab`
    title.append(name, metadata)
    this.element.appendChild(title)

    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Prefab'
    section.appendChild(heading)
    section.append(
      this.createAssetRow('Source', data.entityName),
      this.createAssetRow('Components', String(data.componentCount)),
      this.createAssetRow('Storage', 'Local prefab store'),
    )
    this.element.appendChild(section)

    const canEditScene = view.canInstantiate || view.canEdit
    const hint = document.createElement('p')
    hint.className = 'trion-editor-asset-hint'
    hint.textContent = canEditScene
      ? 'Double-click or drag into the viewport to instantiate, or open it for editing.'
      : 'Scene editing is currently disabled.'
    this.element.appendChild(hint)

    const row = document.createElement('div')
    row.className = 'trion-editor-asset-action-row'
    const addButton = document.createElement('button')
    addButton.type = 'button'
    addButton.className = 'trion-editor-button is-primary'
    addButton.textContent = 'Add to Scene'
    addButton.disabled = !view.canInstantiate
    addButton.addEventListener('click', () => view.onInstantiate?.(data.name))
    const editButton = document.createElement('button')
    editButton.type = 'button'
    editButton.className = 'trion-editor-button'
    editButton.textContent = 'Edit Prefab'
    editButton.disabled = !view.canEdit
    editButton.addEventListener('click', () => view.onEdit?.(data.name))
    row.append(addButton, editButton)
    this.element.appendChild(row)
  }

  renderScene(asset: AssetFileInfo, data: InspectorSceneData, view: InspectorSceneViewOptions): void {
    this.currentEntity = null
    this.currentInputs.clear()
    this.element.replaceChildren()
    this.appendHeader()

    const title = document.createElement('div')
    title.className = 'trion-editor-entity-title'
    const name = document.createElement('div')
    name.className = 'trion-editor-entity-name'
    name.textContent = asset.fileName
    const metadata = document.createElement('div')
    metadata.className = 'trion-editor-entity-metadata'
    metadata.textContent = asset.relativePath
    title.append(name, metadata)
    this.element.appendChild(title)

    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Scene'
    section.appendChild(heading)
    section.append(
      this.createAssetRow('File', asset.fileName),
      this.createAssetRow('Source', data.source),
      this.createAssetRow('Entities', data.entityCount === null ? 'Unknown' : String(data.entityCount)),
    )
    this.element.appendChild(section)

    const hint = document.createElement('p')
    hint.className = 'trion-editor-asset-hint'
    hint.textContent = view.canOpen
      ? 'Double-click to replace the current scene with this one.'
      : 'Scene editing is currently disabled.'
    this.element.appendChild(hint)

    const row = document.createElement('div')
    row.className = 'trion-editor-asset-action'
    const openButton = document.createElement('button')
    openButton.type = 'button'
    openButton.className = 'trion-editor-button is-primary'
    openButton.textContent = 'Open Scene'
    openButton.disabled = !view.canOpen
    openButton.addEventListener('click', () => view.onOpen?.(asset))
    row.appendChild(openButton)
    this.element.appendChild(row)
  }

  private appendHeader(): void {
    const header = document.createElement('div')
    header.className = 'trion-editor-panel-header'
    const headerTitle = document.createElement('span')
    headerTitle.textContent = 'Inspector'
    const context = document.createElement('span')
    context.className = 'trion-editor-panel-context'
    context.textContent = 'Properties'
    header.append(headerTitle, context)
    this.element.appendChild(header)
  }

  private createAssetRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div')
    row.className = 'trion-editor-asset-row'
    const key = document.createElement('span')
    key.className = 'trion-editor-asset-key'
    key.textContent = label
    const val = document.createElement('span')
    val.className = 'trion-editor-asset-value'
    val.textContent = value
    val.title = value
    row.append(key, val)
    return row
  }

  private appendMessage(message: string): void {
    const text = document.createElement('p')
    text.className = 'trion-editor-empty'
    text.textContent = message
    this.element.appendChild(text)
  }

  private createVectorFields(label: string, vector: Vec3): HTMLElement {
    const group = document.createElement('div')
    group.className = 'trion-editor-vector'
    const title = document.createElement('h3')
    title.textContent = label
    group.appendChild(title)
    const prefix = label.toLowerCase()
    for (const axis of ['x', 'y', 'z'] as const) {
      const field = document.createElement('label')
      field.textContent = axis.toUpperCase()
      const input = document.createElement('input')
      input.type = 'number'
      input.step = '0.01'
      input.inputMode = 'decimal'
      input.setAttribute('aria-label', `${label} ${axis.toUpperCase()}`)
      input.value = String(Number(Number(vector[axis]).toFixed(3)))

      let fieldStartTransform: TransformData | null = null
      input.addEventListener('focus', () => {
        if (this.currentEntity) {
          const t = this.currentEntity.getComponent<TransformComponent>('transform')
          if (t) {
            fieldStartTransform = {
              position: { ...t.position },
              rotation: { ...t.rotation },
              scale: { ...t.scale },
            }
          }
        }
      })

      input.addEventListener('input', () => {
        const value = input.valueAsNumber
        if (Number.isFinite(value)) vector[axis] = value
      })

      const commitChange = () => {
        if (this.currentEntity && fieldStartTransform) {
          const t = this.currentEntity.getComponent<TransformComponent>('transform')
          if (t) {
            const current: TransformData = {
              position: { ...t.position },
              rotation: { ...t.rotation },
              scale: { ...t.scale },
            }
            if (!transformsEqual(fieldStartTransform, current)) {
              this.options.onTransformCommit?.(this.currentEntity.id, fieldStartTransform, current)
              fieldStartTransform = { ...current }
            }
          }
        }
      }

      input.addEventListener('change', commitChange)
      input.addEventListener('blur', commitChange)

      this.currentInputs.set(`${prefix}.${axis}`, input)
      field.appendChild(input)
      group.appendChild(field)
    }
    return group
  }
}

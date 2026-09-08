import type { Entity, TransformComponent, Vec3 } from '../engine/index.ts'
import type { RigidBodyComponent } from '../engine/components/RigidBody.ts'
import type { BoxColliderComponent } from '../engine/components/BoxCollider.ts'
import type { SphereColliderComponent } from '../engine/components/SphereCollider.ts'
import type { MeshRendererComponent } from '../engine/components/MeshRenderer.ts'
import type { AnimationComponent } from '../engine/components/Animation.ts'
import type {
  DirectionalLightComponent,
  LightComponentType,
  PointLightComponent,
  SpotLightComponent,
} from '../engine/components/Light.ts'
import type { MaterialProps } from '../engine/graphics/MaterialUtils.ts'
import { transformsEqual, type TransformData } from './EditorHistory.ts'
import type { AssetFileInfo } from './AssetBrowser.ts'

export type PhysicsComponentType = 'rigidBody' | 'boxCollider' | 'sphereCollider'

export interface MaterialListEntry {
  id: string
  label: string
}

export interface InspectorPanelOptions {
  onTransformCommit?: (entityId: number, before: TransformData, after: TransformData) => void
  onPhysicsCommit?: (
    entityId: number,
    componentType: PhysicsComponentType,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => void
  onAddPhysicsComponent?: (entityId: number, componentType: PhysicsComponentType) => void
  onRemovePhysicsComponent?: (entityId: number, componentType: PhysicsComponentType) => void
  onMaterialAssign?: (entityId: number, beforeId: string, afterId: string) => void
  onMaterialPreview?: (materialId: string, props: MaterialProps) => void
  onMaterialPropCommit?: (entityId: number, materialId: string, before: MaterialProps, after: MaterialProps) => void
  onCreateMaterial?: (entityId: number) => void
  getMaterialList?: () => MaterialListEntry[]
  getMaterialProps?: (materialId: string) => MaterialProps | null
  onLightCommit?: (
    entityId: number,
    componentType: LightComponentType,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => void
  onAddLightComponent?: (entityId: number, componentType: LightComponentType) => void
  onRemoveLightComponent?: (entityId: number, componentType: LightComponentType) => void
  onAnimationCommit?: (
    entityId: number,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) => void
  onAddAnimationComponent?: (entityId: number) => void
  onRemoveAnimationComponent?: (entityId: number) => void
  onAnimationStopPreview?: (entityId: number) => void
  onAnimationPreviewToggle?: (entityId: number, playing: boolean) => void
  getAnimationClips?: (entityId: number) => string[]
  getAnimationSource?: (entityId: number) => { assetId: string; clips: string[] } | null
}

export interface InspectorAssetViewOptions {
  canInstantiate: boolean
  onInstantiate?: (asset: AssetFileInfo) => void
}

export interface InspectorEntityViewOptions {
  canSaveAsPrefab?: boolean
  onSaveAsPrefab?: (entity: Entity) => void
  /** Whether physics component add/remove buttons are shown. Defaults to true. */
  canEditComponents?: boolean
}

export interface InspectorPrefabData {
  name: string
  entityName: string
  componentCount: number
}

export interface InspectorMaterialAssetData {
  id: string
  name: string
  props: MaterialProps | null
}

export interface InspectorMaterialAssetViewOptions {
  canAssign: boolean
  assignLabel: string
  onAssign?: (materialId: string) => void
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
    let hasEditableSection = false
    if (transform) {
      hasEditableSection = true
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
    const rigidBody = entity.getComponent<RigidBodyComponent>('rigidBody')
    if (rigidBody) {
      hasEditableSection = true
      this.element.appendChild(this.createRigidBodySection(entity, rigidBody))
    }
    const boxCollider = entity.getComponent<BoxColliderComponent>('boxCollider')
    if (boxCollider) {
      hasEditableSection = true
      this.element.appendChild(this.createBoxColliderSection(entity, boxCollider))
    }
    const sphereCollider = entity.getComponent<SphereColliderComponent>('sphereCollider')
    if (sphereCollider) {
      hasEditableSection = true
      this.element.appendChild(this.createSphereColliderSection(entity, sphereCollider))
    }
    const canEdit = view.canEditComponents !== false
    const meshRenderer = entity.getComponent<MeshRendererComponent>('meshRenderer')
    if (meshRenderer) {
      hasEditableSection = true
      const materialSection = this.createMaterialSection(entity, meshRenderer, canEdit)
      if (materialSection) this.element.appendChild(materialSection)
    }
    const directionalLight = entity.getComponent<DirectionalLightComponent>('directionalLight')
    if (directionalLight) {
      hasEditableSection = true
      this.element.appendChild(this.createDirectionalLightSection(entity, directionalLight, canEdit))
    }
    const pointLight = entity.getComponent<PointLightComponent>('pointLight')
    if (pointLight) {
      hasEditableSection = true
      this.element.appendChild(this.createPointLightSection(entity, pointLight, canEdit))
    }
    const spotLight = entity.getComponent<SpotLightComponent>('spotLight')
    if (spotLight) {
      hasEditableSection = true
      this.element.appendChild(this.createSpotLightSection(entity, spotLight, canEdit))
    }
    const animation = entity.getComponent<AnimationComponent>('animation')
    if (animation) {
      hasEditableSection = true
      this.element.appendChild(this.createAnimationSection(entity, animation, canEdit))
    }
    if (view.canEditComponents !== false) {
      const addSection = this.createAddComponentSection(entity, {
        hasRigidBody: rigidBody !== undefined,
        hasBoxCollider: boxCollider !== undefined,
        hasSphereCollider: sphereCollider !== undefined,
        hasDirectionalLight: directionalLight !== undefined,
        hasPointLight: pointLight !== undefined,
        hasSpotLight: spotLight !== undefined,
        hasAnimation: animation !== undefined,
        canAddAnimation: animation === undefined && (this.options.getAnimationSource?.(entity.id) ?? null) !== null,
      })
      if (addSection) {
        hasEditableSection = true
        this.element.appendChild(addSection)
      }
    }
    if (!hasEditableSection) {
      this.appendMessage('No editable components on this entity.')
    }
  }

  private createRigidBodySection(entity: Entity, rigidBody: RigidBodyComponent): HTMLElement {
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Rigid Body'
    section.appendChild(heading)

    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Body Type'
    const select = document.createElement('select')
    select.className = 'trion-editor-select'
    select.setAttribute('aria-label', 'Body Type')
    for (const option of ['dynamic', 'fixed'] as const) {
      const el = document.createElement('option')
      el.value = option
      el.textContent = option === 'dynamic' ? 'Dynamic' : 'Fixed'
      select.appendChild(el)
    }
    select.value = rigidBody.bodyType

    let startValue: Record<string, unknown> | null = null
    select.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent<RigidBodyComponent>('rigidBody')
      if (current) startValue = { bodyType: current.bodyType }
    })
    select.addEventListener('change', () => {
      const current = this.currentEntity?.getComponent<RigidBodyComponent>('rigidBody')
      if (!current) return
      current.bodyType = select.value === 'fixed' ? 'fixed' : 'dynamic'
      if (this.currentEntity && startValue) {
        const after = { bodyType: current.bodyType }
        if (JSON.stringify(startValue) !== JSON.stringify(after)) {
          this.options.onPhysicsCommit?.(this.currentEntity.id, 'rigidBody', startValue, after)
          startValue = { ...after }
        }
      }
    })
    field.appendChild(select)
    section.appendChild(field)
    section.appendChild(this.createRemoveComponentRow('Remove Rigid Body', () => {
      this.options.onRemovePhysicsComponent?.(entity.id, 'rigidBody')
    }))
    return section
  }

  private createBoxColliderSection(entity: Entity, box: BoxColliderComponent): HTMLElement {
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Box Collider'
    section.appendChild(heading)
    section.appendChild(this.createHalfExtentsFields(box))

    const hint = document.createElement('p')
    hint.className = 'trion-editor-asset-hint'
    hint.textContent = 'Half-extents in world units. Full size = half-extents × 2.'
    section.appendChild(hint)

    section.appendChild(this.createRemoveComponentRow('Remove Box Collider', () => {
      this.options.onRemovePhysicsComponent?.(entity.id, 'boxCollider')
    }))
    return section
  }

  private createSphereColliderSection(entity: Entity, sphere: SphereColliderComponent): HTMLElement {
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Sphere Collider'
    section.appendChild(heading)

    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Radius'
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '0.01'
    input.step = '0.01'
    input.inputMode = 'decimal'
    input.setAttribute('aria-label', 'Sphere radius')
    input.value = String(Number(Number(sphere.radius).toFixed(3)))

    let startValue: Record<string, unknown> | null = null
    input.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent<SphereColliderComponent>('sphereCollider')
      if (current) startValue = { radius: current.radius }
    })
    input.addEventListener('input', () => {
      const value = input.valueAsNumber
      if (Number.isFinite(value)) sphere.radius = value
    })
    const commitChange = () => {
      const current = this.currentEntity?.getComponent<SphereColliderComponent>('sphereCollider')
      if (this.currentEntity && current && startValue) {
        if (!Number.isFinite(current.radius) || current.radius <= 0) {
          current.radius = 0.01
          input.value = '0.01'
        }
        const after = { radius: current.radius }
        if (JSON.stringify(startValue) !== JSON.stringify(after)) {
          this.options.onPhysicsCommit?.(this.currentEntity.id, 'sphereCollider', startValue, after)
          startValue = { ...after }
        }
      }
    }
    input.addEventListener('change', commitChange)
    input.addEventListener('blur', commitChange)

    field.appendChild(input)
    section.appendChild(field)
    section.appendChild(this.createRemoveComponentRow('Remove Sphere Collider', () => {
      this.options.onRemovePhysicsComponent?.(entity.id, 'sphereCollider')
    }))
    return section
  }

  private createHalfExtentsFields(box: BoxColliderComponent): HTMLElement {
    const group = document.createElement('div')
    group.className = 'trion-editor-vector'
    const title = document.createElement('h3')
    title.textContent = 'Half Extents'
    group.appendChild(title)
    for (const axis of ['x', 'y', 'z'] as const) {
      const field = document.createElement('label')
      field.textContent = axis.toUpperCase()
      const input = document.createElement('input')
      input.type = 'number'
      input.min = '0.01'
      input.step = '0.01'
      input.inputMode = 'decimal'
      input.setAttribute('aria-label', `Half extents ${axis.toUpperCase()}`)
      input.value = String(Number(Number(box.halfExtents[axis]).toFixed(3)))

      let fieldStartValue: Record<string, unknown> | null = null
      input.addEventListener('focus', () => {
        const current = this.currentEntity?.getComponent<BoxColliderComponent>('boxCollider')
        if (current) {
          fieldStartValue = { halfExtents: { ...current.halfExtents } }
        }
      })
      input.addEventListener('input', () => {
        const value = input.valueAsNumber
        if (Number.isFinite(value)) box.halfExtents[axis] = value
      })
      const commitChange = () => {
        const current = this.currentEntity?.getComponent<BoxColliderComponent>('boxCollider')
        if (this.currentEntity && current && fieldStartValue) {
          let clamped = false
          for (const a of ['x', 'y', 'z'] as const) {
            if (!Number.isFinite(current.halfExtents[a]) || current.halfExtents[a] <= 0) {
              current.halfExtents[a] = 0.01
              clamped = true
            }
          }
          if (clamped) input.value = String(Number(Number(current.halfExtents[axis]).toFixed(3)))
          const after = { halfExtents: { ...current.halfExtents } }
          if (JSON.stringify(fieldStartValue) !== JSON.stringify(after)) {
            this.options.onPhysicsCommit?.(this.currentEntity.id, 'boxCollider', fieldStartValue, after)
            fieldStartValue = { halfExtents: { ...current.halfExtents } }
          }
        }
      }
      input.addEventListener('change', commitChange)
      input.addEventListener('blur', commitChange)

      field.appendChild(input)
      group.appendChild(field)
    }
    return group
  }

  private createRemoveComponentRow(label: string, onRemove: () => void): HTMLElement {
    const row = document.createElement('div')
    row.className = 'trion-editor-component-remove'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'trion-editor-button'
    button.textContent = label
    button.addEventListener('click', onRemove)
    row.appendChild(button)
    return row
  }

  private createAddComponentSection(
    entity: Entity,
    presence: {
      hasRigidBody: boolean
      hasBoxCollider: boolean
      hasSphereCollider: boolean
      hasDirectionalLight: boolean
      hasPointLight: boolean
      hasSpotLight: boolean
      hasAnimation: boolean
      canAddAnimation: boolean
    },
  ): HTMLElement | null {
    const physicsMissing: Array<{ type: PhysicsComponentType; label: string }> = []
    if (!presence.hasRigidBody) physicsMissing.push({ type: 'rigidBody', label: 'Add Rigid Body' })
    if (!presence.hasBoxCollider) physicsMissing.push({ type: 'boxCollider', label: 'Add Box Collider' })
    if (!presence.hasSphereCollider) physicsMissing.push({ type: 'sphereCollider', label: 'Add Sphere Collider' })
    const lightMissing: Array<{ type: LightComponentType; label: string }> = []
    if (!presence.hasDirectionalLight) lightMissing.push({ type: 'directionalLight', label: 'Add Directional Light' })
    if (!presence.hasPointLight) lightMissing.push({ type: 'pointLight', label: 'Add Point Light' })
    if (!presence.hasSpotLight) lightMissing.push({ type: 'spotLight', label: 'Add Spot Light' })
    if (physicsMissing.length === 0 && lightMissing.length === 0 && (presence.hasAnimation || !presence.canAddAnimation)) return null

    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Add Component'
    section.appendChild(heading)
    const row = document.createElement('div')
    row.className = 'trion-editor-component-actions'
    for (const { type, label } of physicsMissing) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-button'
      button.textContent = label
      button.addEventListener('click', () => {
        this.options.onAddPhysicsComponent?.(entity.id, type)
      })
      row.appendChild(button)
    }
    for (const { type, label } of lightMissing) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-button'
      button.textContent = label
      button.addEventListener('click', () => {
        this.options.onAddLightComponent?.(entity.id, type)
      })
      row.appendChild(button)
    }
    if (!presence.hasAnimation && presence.canAddAnimation) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-button'
      button.textContent = 'Add Animation'
      button.addEventListener('click', () => {
        this.options.onAddAnimationComponent?.(entity.id)
      })
      row.appendChild(button)
    }
    section.appendChild(row)
    return section
  }

  private createMaterialSection(entity: Entity, meshRenderer: MeshRendererComponent, canEdit: boolean): HTMLElement | null {
    const getProps = this.options.getMaterialProps
    const listMaterials = this.options.getMaterialList
    if (!getProps || !listMaterials) return null

    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Material'
    section.appendChild(heading)

    const assignField = document.createElement('label')
    assignField.className = 'trion-editor-field'
    assignField.textContent = 'Material'
    const select = document.createElement('select')
    select.className = 'trion-editor-select'
    select.setAttribute('aria-label', 'Material')
    select.disabled = !canEdit
    const available = listMaterials()
    const seen = new Set(available.map((entry) => entry.id))
    const options = [...available]
    if (!seen.has(meshRenderer.materialId)) {
      options.push({ id: meshRenderer.materialId, label: `${meshRenderer.materialId} (imported)` })
    }
    for (const entry of options) {
      const option = document.createElement('option')
      option.value = entry.id
      option.textContent = entry.label
      select.appendChild(option)
    }
    select.value = meshRenderer.materialId

    let assignStartId: string | null = null
    select.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent<MeshRendererComponent>('meshRenderer')
      assignStartId = current ? current.materialId : meshRenderer.materialId
    })
    select.addEventListener('change', () => {
      const current = this.currentEntity?.getComponent<MeshRendererComponent>('meshRenderer')
      if (!current) return
      const nextId = select.value
      if (!nextId || nextId === current.materialId) return
      const beforeId = assignStartId ?? current.materialId
      current.materialId = nextId
      assignStartId = nextId
      if (beforeId !== nextId) {
        this.options.onMaterialAssign?.(entity.id, beforeId, nextId)
      }
    })
    assignField.appendChild(select)
    section.appendChild(assignField)

    const props = getProps(meshRenderer.materialId)
    if (!props) {
      const hint = document.createElement('p')
      hint.className = 'trion-editor-asset-hint'
      hint.textContent = 'This material has no editable properties.'
      section.appendChild(hint)
    } else {
      section.appendChild(this.createMaterialColorField(entity, meshRenderer, props, canEdit))
      section.appendChild(this.createMaterialNumberField(entity, meshRenderer, props, 'roughness', 'Roughness', canEdit))
      section.appendChild(this.createMaterialNumberField(entity, meshRenderer, props, 'metalness', 'Metalness', canEdit))
      section.appendChild(this.createMaterialNumberField(entity, meshRenderer, props, 'opacity', 'Opacity', canEdit))
      section.appendChild(this.createMaterialTransparentField(entity, meshRenderer, props, canEdit))
      const hint = document.createElement('p')
      hint.className = 'trion-editor-asset-hint'
      hint.textContent = 'Edits apply to the shared material asset and affect every entity using it.'
      section.appendChild(hint)
    }

    if (canEdit && this.options.onCreateMaterial) {
      const row = document.createElement('div')
      row.className = 'trion-editor-asset-action'
      const action = document.createElement('button')
      action.type = 'button'
      action.className = 'trion-editor-button'
      action.textContent = 'New Material'
      action.addEventListener('click', () => this.options.onCreateMaterial?.(entity.id))
      row.appendChild(action)
      section.appendChild(row)
    }
    return section
  }

  private previewMaterialProps(materialId: string, patch: Partial<MaterialProps>): MaterialProps | null {
    const current = this.options.getMaterialProps?.(materialId)
    if (!current) return null
    const next: MaterialProps = { ...current, ...patch }
    this.options.onMaterialPreview?.(materialId, next)
    return next
  }

  private commitMaterialProps(entityId: number, materialId: string, start: MaterialProps | null): MaterialProps | null {
    const live = this.options.getMaterialProps?.(materialId) ?? null
    if (this.currentEntity && live && start && JSON.stringify(start) !== JSON.stringify(live)) {
      this.options.onMaterialPropCommit?.(entityId, materialId, start, { ...live })
      return { ...live }
    }
    return start
  }

  private createMaterialColorField(
    entity: Entity,
    meshRenderer: MeshRendererComponent,
    props: MaterialProps,
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Base Color'
    const input = document.createElement('input')
    input.type = 'color'
    input.setAttribute('aria-label', 'Base Color')
    input.value = props.color
    input.disabled = !canEdit
    let start: MaterialProps | null = null
    input.addEventListener('focus', () => {
      start = this.options.getMaterialProps?.(meshRenderer.materialId) ?? null
    })
    input.addEventListener('input', () => {
      this.previewMaterialProps(meshRenderer.materialId, { color: input.value })
    })
    input.addEventListener('change', () => {
      start = this.commitMaterialProps(entity.id, meshRenderer.materialId, start)
    })
    field.appendChild(input)
    return field
  }

  private createMaterialNumberField(
    entity: Entity,
    meshRenderer: MeshRendererComponent,
    props: MaterialProps,
    key: 'roughness' | 'metalness' | 'opacity',
    label: string,
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = label
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '0'
    input.max = '1'
    input.step = '0.01'
    input.inputMode = 'decimal'
    input.setAttribute('aria-label', label)
    input.value = String(props[key])
    input.disabled = !canEdit
    let start: MaterialProps | null = null
    input.addEventListener('focus', () => {
      start = this.options.getMaterialProps?.(meshRenderer.materialId) ?? null
    })
    input.addEventListener('input', () => {
      const value = input.valueAsNumber
      if (Number.isFinite(value)) {
        this.previewMaterialProps(meshRenderer.materialId, { [key]: Math.min(1, Math.max(0, value)) } as Partial<MaterialProps>)
      }
    })
    const commit = () => {
      const live = this.options.getMaterialProps?.(meshRenderer.materialId)
      if (live) {
        const clamped = Math.min(1, Math.max(0, Number(live[key])))
        if (Number.isFinite(clamped) && clamped !== live[key]) {
          this.previewMaterialProps(meshRenderer.materialId, { [key]: clamped } as Partial<MaterialProps>)
        }
        input.value = String(this.options.getMaterialProps?.(meshRenderer.materialId)?.[key] ?? clamped)
      }
      start = this.commitMaterialProps(entity.id, meshRenderer.materialId, start)
    }
    input.addEventListener('change', commit)
    input.addEventListener('blur', commit)
    field.appendChild(input)
    return field
  }

  private createMaterialTransparentField(
    entity: Entity,
    meshRenderer: MeshRendererComponent,
    props: MaterialProps,
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Transparent'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('aria-label', 'Transparent')
    input.checked = props.transparent
    input.disabled = !canEdit
    let start: MaterialProps | null = null
    input.addEventListener('focus', () => {
      start = this.options.getMaterialProps?.(meshRenderer.materialId) ?? null
    })
    input.addEventListener('change', () => {
      if (!start) start = this.options.getMaterialProps?.(meshRenderer.materialId) ?? null
      this.previewMaterialProps(meshRenderer.materialId, { transparent: input.checked })
      start = this.commitMaterialProps(entity.id, meshRenderer.materialId, start)
    })
    field.appendChild(input)
    return field
  }

  private snapshotLight(component: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const key of keys) out[key] = component[key]
    return JSON.parse(JSON.stringify(out)) as Record<string, unknown>
  }

  private createLightColorField(
    componentType: LightComponentType,
    component: Record<string, unknown>,
    keys: string[],
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Color'
    const input = document.createElement('input')
    input.type = 'color'
    input.setAttribute('aria-label', 'Light color')
    input.value = typeof component.color === 'string' ? component.color : '#ffffff'
    input.disabled = !canEdit
    let start: Record<string, unknown> | null = null
    input.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent(componentType) as Record<string, unknown> | undefined
      if (current) start = this.snapshotLight(current, keys)
    })
    input.addEventListener('input', () => {
      component.color = input.value
    })
    input.addEventListener('change', () => {
      const current = this.currentEntity?.getComponent(componentType) as Record<string, unknown> | undefined
      if (this.currentEntity && current && start) {
        const after = this.snapshotLight(current, keys)
        if (JSON.stringify(start) !== JSON.stringify(after)) {
          this.options.onLightCommit?.(this.currentEntity.id, componentType, start, after)
          start = after
        }
      }
    })
    field.appendChild(input)
    return field
  }

  private createLightNumberField(
    componentType: LightComponentType,
    component: Record<string, unknown>,
    keys: string[],
    key: string,
    label: string,
    options: { min?: string; max?: string; step?: string; toComponent?: (v: number) => number; fromComponent?: (v: unknown) => number },
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = label
    const input = document.createElement('input')
    input.type = 'number'
    if (options.min !== undefined) input.min = options.min
    if (options.max !== undefined) input.max = options.max
    if (options.step !== undefined) input.step = options.step
    input.inputMode = 'decimal'
    input.setAttribute('aria-label', label)
    const fromComponent = options.fromComponent ?? ((v: unknown) => (typeof v === 'number' ? v : 0))
    input.value = String(fromComponent(component[key]))
    input.disabled = !canEdit
    let start: Record<string, unknown> | null = null
    input.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent(componentType) as Record<string, unknown> | undefined
      if (current) start = this.snapshotLight(current, keys)
    })
    input.addEventListener('input', () => {
      const value = input.valueAsNumber
      if (Number.isFinite(value)) {
        component[key] = options.toComponent ? options.toComponent(value) : value
      }
    })
    const commit = () => {
      const current = this.currentEntity?.getComponent(componentType) as Record<string, unknown> | undefined
      if (this.currentEntity && current && start) {
        const after = this.snapshotLight(current, keys)
        if (JSON.stringify(start) !== JSON.stringify(after)) {
          this.options.onLightCommit?.(this.currentEntity.id, componentType, start, after)
          start = after
        } else {
          input.value = String(fromComponent(current[key]))
        }
      }
    }
    input.addEventListener('change', commit)
    input.addEventListener('blur', commit)
    field.appendChild(input)
    return field
  }

  private createDirectionalLightSection(entity: Entity, light: DirectionalLightComponent, canEdit: boolean): HTMLElement {
    const keys = ['color', 'intensity']
    const component = light as unknown as Record<string, unknown>
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Directional Light'
    section.appendChild(heading)
    section.appendChild(this.createLightColorField('directionalLight', component, keys, canEdit))
    section.appendChild(this.createLightNumberField('directionalLight', component, keys, 'intensity', 'Intensity', { min: '0', step: '0.1' }, canEdit))
    if (canEdit) {
      section.appendChild(this.createRemoveComponentRow('Remove Directional Light', () => {
        this.options.onRemoveLightComponent?.(entity.id, 'directionalLight')
      }))
    }
    return section
  }

  private createPointLightSection(entity: Entity, light: PointLightComponent, canEdit: boolean): HTMLElement {
    const keys = ['color', 'intensity', 'distance']
    const component = light as unknown as Record<string, unknown>
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Point Light'
    section.appendChild(heading)
    section.appendChild(this.createLightColorField('pointLight', component, keys, canEdit))
    section.appendChild(this.createLightNumberField('pointLight', component, keys, 'intensity', 'Intensity', { min: '0', step: '0.1' }, canEdit))
    section.appendChild(this.createLightNumberField('pointLight', component, keys, 'distance', 'Range', { min: '0', step: '0.1' }, canEdit))
    if (canEdit) {
      section.appendChild(this.createRemoveComponentRow('Remove Point Light', () => {
        this.options.onRemoveLightComponent?.(entity.id, 'pointLight')
      }))
    }
    return section
  }

  private createSpotLightSection(entity: Entity, light: SpotLightComponent, canEdit: boolean): HTMLElement {
    const keys = ['color', 'intensity', 'distance', 'angle', 'penumbra']
    const component = light as unknown as Record<string, unknown>
    const toDegrees = (v: unknown): number => {
      const radians = typeof v === 'number' && Number.isFinite(v) ? v : Math.PI / 6
      return Math.round(radians * 180 / Math.PI * 100) / 100
    }
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Spot Light'
    section.appendChild(heading)
    section.appendChild(this.createLightColorField('spotLight', component, keys, canEdit))
    section.appendChild(this.createLightNumberField('spotLight', component, keys, 'intensity', 'Intensity', { min: '0', step: '0.1' }, canEdit))
    section.appendChild(this.createLightNumberField('spotLight', component, keys, 'distance', 'Range', { min: '0', step: '0.1' }, canEdit))
    section.appendChild(this.createLightNumberField('spotLight', component, keys, 'angle', 'Cone Angle (°)', {
      min: '1',
      max: '89',
      step: '1',
      fromComponent: toDegrees,
      toComponent: (v: number) => Math.min(89, Math.max(1, v)) * Math.PI / 180,
    }, canEdit))
    section.appendChild(this.createLightNumberField('spotLight', component, keys, 'penumbra', 'Penumbra', { min: '0', max: '1', step: '0.01' }, canEdit))
    if (canEdit) {
      section.appendChild(this.createRemoveComponentRow('Remove Spot Light', () => {
        this.options.onRemoveLightComponent?.(entity.id, 'spotLight')
      }))
    }
    return section
  }

  private createAnimationSection(entity: Entity, animation: AnimationComponent, canEdit: boolean): HTMLElement {
    const component = animation as unknown as Record<string, unknown>
    const section = document.createElement('section')
    section.className = 'trion-editor-component'
    const heading = document.createElement('h2')
    heading.textContent = 'Animation'
    section.appendChild(heading)

    const clips = this.options.getAnimationClips?.(entity.id) ?? []
    if (clips.length === 0 && (animation.activeClip === undefined || animation.activeClip === null)) {
      const hint = document.createElement('p')
      hint.className = 'trion-editor-asset-hint'
      hint.textContent = 'No animation clips are available for this entity.'
      section.appendChild(hint)
    } else {
      section.appendChild(this.createAnimationClipField(component, clips, canEdit))
    }
    section.appendChild(this.createAnimationPlayingField(entity, component, canEdit))
    section.appendChild(this.createAnimationLoopField(component, canEdit))
    section.appendChild(this.createAnimationSpeedField(component, canEdit))

    if (canEdit) {
      const previewRow = document.createElement('div')
      previewRow.className = 'trion-editor-asset-action'
      const stopButton = document.createElement('button')
      stopButton.type = 'button'
      stopButton.className = 'trion-editor-button'
      stopButton.textContent = '⏹ Stop Preview'
      stopButton.title = 'Pause and reset the preview to the bind pose (no history entry)'
      stopButton.addEventListener('click', () => this.options.onAnimationStopPreview?.(entity.id))
      previewRow.appendChild(stopButton)
      section.appendChild(previewRow)

      const hint = document.createElement('p')
      hint.className = 'trion-editor-asset-hint'
      hint.textContent = 'Preview plays in Edit Mode through the runtime AnimationSystem. Play/pause and stop are preview transport and create no history entries.'
      section.appendChild(hint)

      section.appendChild(this.createRemoveComponentRow('Remove Animation', () => {
        this.options.onRemoveAnimationComponent?.(entity.id)
      }))
    }
    return section
  }

  private snapshotAnimation(component: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const key of ['activeClip', 'playing', 'loop', 'speed']) out[key] = component[key]
    return JSON.parse(JSON.stringify(out)) as Record<string, unknown>
  }

  private formatClipLabel(clipId: string): string {
    const match = /^(.+)\/animation\/(\d+)$/.exec(clipId)
    return match ? `${match[1]} · clip ${match[2]}` : clipId
  }

  private createAnimationClipField(
    component: Record<string, unknown>,
    clips: string[],
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Clip'
    const select = document.createElement('select')
    select.className = 'trion-editor-select'
    select.setAttribute('aria-label', 'Animation clip')
    select.disabled = !canEdit
    const options = [...clips]
    const activeClip = typeof component.activeClip === 'string' ? component.activeClip : undefined
    if (activeClip !== undefined && !options.includes(activeClip)) {
      options.push(activeClip)
    }
    for (const clipId of options) {
      const option = document.createElement('option')
      option.value = clipId
      option.textContent = clipId === activeClip && !clips.includes(clipId)
        ? `${this.formatClipLabel(clipId)} (missing)`
        : this.formatClipLabel(clipId)
      select.appendChild(option)
    }
    if (activeClip !== undefined) select.value = activeClip

    let start: Record<string, unknown> | null = null
    select.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent('animation') as Record<string, unknown> | undefined
      if (current) start = this.snapshotAnimation(current)
    })
    select.addEventListener('change', () => {
      const current = this.currentEntity?.getComponent('animation') as Record<string, unknown> | undefined
      if (!current || !select.value) return
      current.activeClip = select.value
      if (this.currentEntity && start) {
        const after = this.snapshotAnimation(current)
        if (JSON.stringify(start) !== JSON.stringify(after)) {
          this.options.onAnimationCommit?.(this.currentEntity.id, start, after)
          start = after
        }
      }
    })
    field.appendChild(select)
    return field
  }

  private createAnimationPlayingField(
    entity: Entity,
    component: Record<string, unknown>,
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Playing'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('aria-label', 'Animation playing')
    input.checked = component.playing === true
    input.disabled = !canEdit
    input.addEventListener('change', () => {
      this.options.onAnimationPreviewToggle?.(entity.id, input.checked)
    })
    field.appendChild(input)
    return field
  }

  private createAnimationLoopField(
    component: Record<string, unknown>,
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Loop'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('aria-label', 'Animation loop')
    input.checked = component.loop === true
    input.disabled = !canEdit
    let start: Record<string, unknown> | null = null
    input.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent('animation') as Record<string, unknown> | undefined
      if (current) start = this.snapshotAnimation(current)
    })
    input.addEventListener('change', () => {
      const current = this.currentEntity?.getComponent('animation') as Record<string, unknown> | undefined
      if (!current) return
      if (!start) start = this.snapshotAnimation(current)
      current.loop = input.checked
      if (this.currentEntity && start) {
        const after = this.snapshotAnimation(current)
        if (JSON.stringify(start) !== JSON.stringify(after)) {
          this.options.onAnimationCommit?.(this.currentEntity.id, start, after)
          start = after
        }
      }
    })
    field.appendChild(input)
    return field
  }

  private createAnimationSpeedField(
    component: Record<string, unknown>,
    canEdit: boolean,
  ): HTMLElement {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Speed'
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '0'
    input.step = '0.1'
    input.inputMode = 'decimal'
    input.setAttribute('aria-label', 'Animation speed')
    input.value = typeof component.speed === 'number' && Number.isFinite(component.speed) ? String(component.speed) : '1'
    input.disabled = !canEdit
    const readSpeed = (record: Record<string, unknown>): number => {
      const value = record.speed
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 1
    }
    let start: Record<string, unknown> | null = null
    input.addEventListener('focus', () => {
      const current = this.currentEntity?.getComponent('animation') as Record<string, unknown> | undefined
      if (current) start = this.snapshotAnimation(current)
    })
    input.addEventListener('input', () => {
      const value = input.valueAsNumber
      if (Number.isFinite(value) && value >= 0) {
        component.speed = value
      }
    })
    const commit = () => {
      const current = this.currentEntity?.getComponent('animation') as Record<string, unknown> | undefined
      if (this.currentEntity && current && start) {
        const after = this.snapshotAnimation(current)
        if (JSON.stringify(start) !== JSON.stringify(after)) {
          this.options.onAnimationCommit?.(this.currentEntity.id, start, after)
          start = after
        } else {
          input.value = String(readSpeed(current))
        }
      }
    }
    input.addEventListener('change', commit)
    input.addEventListener('blur', commit)
    field.appendChild(input)
    return field
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

  renderMaterialAsset(asset: AssetFileInfo, data: InspectorMaterialAssetData, view: InspectorMaterialAssetViewOptions): void {
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
    heading.textContent = 'Material'
    section.appendChild(heading)
    section.append(
      this.createAssetRow('Name', data.name),
      this.createAssetRow('Base Color', data.props ? data.props.color : '—'),
      this.createAssetRow('Roughness', data.props ? String(data.props.roughness) : '—'),
      this.createAssetRow('Metalness', data.props ? String(data.props.metalness) : '—'),
      this.createAssetRow('Opacity', data.props ? String(data.props.opacity) : '—'),
      this.createAssetRow('Transparent', data.props ? (data.props.transparent ? 'Yes' : 'No') : '—'),
    )
    this.element.appendChild(section)

    const hint = document.createElement('p')
    hint.className = 'trion-editor-asset-hint'
    hint.textContent = view.canAssign
      ? 'Double-click to assign this material to the selected entity, or use the button below.'
      : 'Select a renderable entity to assign this material.'
    this.element.appendChild(hint)

    const row = document.createElement('div')
    row.className = 'trion-editor-asset-action'
    const action = document.createElement('button')
    action.type = 'button'
    action.className = 'trion-editor-button is-primary'
    action.textContent = view.assignLabel
    action.disabled = !view.canAssign
    action.addEventListener('click', () => view.onAssign?.(data.id))
    row.appendChild(action)
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

import type { Entity, TransformComponent, Vec3 } from '../engine/index.ts'

/** Inspector limited to the first editable component: Transform. */
export class InspectorPanel {
  readonly element: HTMLElement
  private readonly currentInputs = new Map<string, HTMLInputElement>()

  constructor() {
    this.element = document.createElement('aside')
    this.element.className = 'trion-editor-panel trion-editor-inspector'
  }

  render(entity: Entity | null): void {
    this.currentInputs.clear()
    this.element.replaceChildren()
    const header = document.createElement('div')
    header.className = 'trion-editor-panel-header'
    const headerTitle = document.createElement('span')
    headerTitle.textContent = 'Inspector'
    const context = document.createElement('span')
    context.className = 'trion-editor-panel-context'
    context.textContent = 'Properties'
    header.append(headerTitle, context)
    this.element.appendChild(header)
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
      input.addEventListener('input', () => {
        const value = input.valueAsNumber
        if (Number.isFinite(value)) vector[axis] = value
      })
      this.currentInputs.set(`${prefix}.${axis}`, input)
      field.appendChild(input)
      group.appendChild(field)
    }
    return group
  }
}

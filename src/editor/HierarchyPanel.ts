import type { Entity } from '../engine/index.ts'

export interface HierarchyPanelOptions {
  onSelectEntity: (entity: Entity) => void
}

/** DOM-backed entity list for the active scene. */
export class HierarchyPanel {
  readonly element: HTMLElement
  private readonly list: HTMLUListElement
  private readonly options: HierarchyPanelOptions

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
    this.element.append(header, this.list)
  }

  render(entities: Entity[], selectedEntityId: number | null): void {
    this.list.replaceChildren()
    for (const entity of entities) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-entity'
      button.textContent = entity.name?.trim() || `Entity ${entity.id}`
      button.title = `Entity ID: ${entity.id}`
      button.classList.toggle('is-selected', entity.id === selectedEntityId)
      button.addEventListener('click', () => this.options.onSelectEntity(entity))
      item.appendChild(button)
      this.list.appendChild(item)
    }
  }

  dispose(): void {
    this.element.remove()
  }
}

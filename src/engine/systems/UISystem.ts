import type { Scene } from '../core/Scene.ts'
import type { UIComponent } from '../components/ui/UI.ts'
import type { UITextComponent } from '../components/ui/UIText.ts'
import type { UIButtonComponent } from '../components/ui/UIButton.ts'

/**
 * Bridges ECS UI components to the browser DOM.
 * 
 * Creates a root UI container on the document body and manages child elements
 * mapped to entity IDs. Cleans up DOM nodes and interaction state when entities
 * or components are removed.
 */
export class UISystem {
  private readonly scene: Scene
  private readonly root: HTMLElement
  private readonly elements = new Map<number, HTMLElement>()

  constructor(scene: Scene) {
    this.scene = scene

    // Create a container to hold all UI elements
    this.root = document.createElement('div')
    this.root.id = 'trion-ui-root'
    // Position it absolutely over everything
    this.root.style.position = 'absolute'
    this.root.style.top = '0'
    this.root.style.left = '0'
    this.root.style.width = '100%'
    this.root.style.height = '100%'
    // Prevent the root itself from blocking clicks to the canvas
    this.root.style.pointerEvents = 'none'
    // Ensure no scrollbars from UI overflow
    this.root.style.overflow = 'hidden'
    document.body.appendChild(this.root)
  }

  update(_deltaTime: number): void {
    const uiEntities = this.scene.getEntitiesWithComponent('ui')

    for (const entity of uiEntities) {
      const ui = entity.getComponent<UIComponent>('ui')!
      let el = this.elements.get(entity.id)

      if (!el) {
        el = this.createDOMElement(entity.id)
        this.elements.set(entity.id, el)
        this.root.appendChild(el)
      }

      this.syncDOMElement(el, ui)
      
      const text = entity.getComponent<UITextComponent>('uiText')
      if (text) {
        this.syncText(el, text)
      } else {
        el.textContent = ''
      }

      const button = entity.getComponent<UIButtonComponent>('uiButton')
      if (button) {
        // Re-enable pointer events so interaction works
        el.style.pointerEvents = button.interactable && ui.visible ? 'auto' : 'none'
        // Let the CSS cursor indicate interactivity
        el.style.cursor = button.interactable && ui.visible ? 'pointer' : 'default'
      } else {
        el.style.pointerEvents = 'none'
        el.style.cursor = 'default'
      }
    }

    this.removeStaleElements()
  }

  private createDOMElement(entityId: number): HTMLElement {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    // Prevent text selection inside UI elements by default
    el.style.userSelect = 'none'
    // Use flexbox to center text easily (a pragmatic choice for the minimal subsystem)
    el.style.display = 'flex'
    el.style.justifyContent = 'center'
    el.style.alignItems = 'center'

    // Attach pointer events for the UIButton interaction mapping
    el.addEventListener('pointerenter', () => this.setButtonHover(entityId, true))
    el.addEventListener('pointerleave', () => {
      this.setButtonHover(entityId, false)
      this.setButtonPress(entityId, false) // dragging out cancels press
    })
    el.addEventListener('pointerdown', () => this.setButtonPress(entityId, true))
    el.addEventListener('pointerup', () => this.setButtonPress(entityId, false))

    return el
  }

  private setButtonHover(entityId: number, isHovered: boolean): void {
    const entity = this.scene.getEntity(entityId)
    const button = entity?.getComponent<UIButtonComponent>('uiButton')
    if (button && button.interactable) {
      button.isHovered = isHovered
    }
  }

  private setButtonPress(entityId: number, isPressed: boolean): void {
    const entity = this.scene.getEntity(entityId)
    const button = entity?.getComponent<UIButtonComponent>('uiButton')
    if (button && button.interactable) {
      button.isPressed = isPressed
    }
  }

  private syncDOMElement(el: HTMLElement, ui: UIComponent): void {
    el.style.left = `${ui.position.x}px`
    el.style.top = `${ui.position.y}px`
    el.style.width = `${ui.size.x}px`
    el.style.height = `${ui.size.y}px`
    el.style.visibility = ui.visible ? 'visible' : 'hidden'
    el.style.backgroundColor = ui.backgroundColor ?? 'transparent'
  }

  private syncText(el: HTMLElement, text: UITextComponent): void {
    el.textContent = text.text
    el.style.color = text.color
    el.style.fontSize = `${text.fontSize}px`
  }

  private removeStaleElements(): void {
    const staleIds: number[] = []

    for (const entityId of this.elements.keys()) {
      const entity = this.scene.getEntity(entityId)
      if (!entity || !entity.hasComponent('ui')) {
        staleIds.push(entityId)
      }
    }

    for (const id of staleIds) {
      const el = this.elements.get(id)
      if (el) {
        el.remove() // Removes from DOM and drops internal event listeners
        this.elements.delete(id)
      }
    }
  }

  dispose(): void {
    this.root.remove()
    this.elements.clear()
  }
}

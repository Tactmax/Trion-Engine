import type { Component } from '../components/Component.ts'

export interface EntityMetadata {
  name?: string
  tag?: string
}

export class Entity {
  readonly id: number
  name?: string
  tag?: string
  private readonly components = new Map<string, Component>()

  constructor(id: number, metadata: EntityMetadata = {}) {
    this.id = id
    this.name = metadata.name
    this.tag = metadata.tag
  }

  addComponent(component: Component): this {
    this.components.set(component.type, component)
    return this
  }

  getComponent<T extends Component>(type: string): T | undefined {
    return this.components.get(type) as T | undefined
  }

  hasComponent(type: string): boolean {
    return this.components.has(type)
  }

  removeComponent(type: string): boolean {
    return this.components.delete(type)
  }

  getAllComponents(): Component[] {
    return [...this.components.values()]
  }

  update(deltaTime: number): void {
    for (const component of this.components.values()) {
      component.update?.(deltaTime)
    }
  }
}

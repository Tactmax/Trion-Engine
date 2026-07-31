import type { Component } from '../components/Component.ts'

export type PrefabOverrides = Record<string, Record<string, unknown>>

/**
 * Immutable component templates used to create entities. A Prefab is not part
 * of a Scene and never owns runtime component instances.
 */
export class Prefab {
  private readonly templates: readonly Component[]

  constructor(components: readonly Component[]) {
    this.templates = Object.freeze(components.map((component) => freezeComponent(cloneComponent(component))))
  }

  createComponents(overrides: PrefabOverrides = {}): Component[] {
    return this.templates.map((template) => {
      const component = cloneComponent(template)
      const override = overrides[component.type]

      if (override) applyOverrides(component as unknown as Record<string, unknown>, override)
      return component
    })
  }
}

export function createPrefab(components: readonly Component[]): Prefab {
  return new Prefab(components)
}

function cloneComponent<T extends Component>(component: T): T {
  return cloneValue(component) as T
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (!isPlainObject(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]))
}

function freezeComponent<T extends Component>(component: T): T {
  freezeValue(component)
  return component
}

function freezeValue(value: unknown): void {
  if (Array.isArray(value)) {
    for (const child of value) freezeValue(child)
    Object.freeze(value)
    return
  }

  if (!isPlainObject(value)) return
  for (const child of Object.values(value)) freezeValue(child)
  Object.freeze(value)
}

function applyOverrides(target: Record<string, unknown>, overrides: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(overrides)) {
    // The component type determines ECS storage and must remain stable.
    if (key === 'type') continue

    const existing = target[key]
    if (isPlainObject(existing) && isPlainObject(value)) {
      applyOverrides(existing, value)
    } else {
      target[key] = cloneValue(value)
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

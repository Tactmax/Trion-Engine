import type { Component } from '../components/Component.ts'
import type { Entity } from './Entity.ts'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface SerializedEntity {
  id: number
  name?: string
  tag?: string
  components: Record<string, { [key: string]: JsonValue }>
}

export interface SceneData {
  entities: SerializedEntity[]
}

export function serializeEntities(entities: Iterable<Entity>): SceneData {
  return { entities: [...entities].map(serializeEntity) }
}

export function readSerializedEntities(data: unknown): SerializedEntity[] {
  if (!isRecord(data) || !Array.isArray(data.entities)) return []

  return data.entities.flatMap((entity) => {
    const parsed = readEntity(entity)
    return parsed ? [parsed] : []
  })
}

function serializeEntity(entity: Entity): SerializedEntity {
  const components: SerializedEntity['components'] = {}

  for (const component of entity.getAllComponents()) {
    const data = serializeComponent(component)
    if (data) components[component.type] = data
  }

  return {
    id: entity.id,
    ...(entity.name === undefined ? {} : { name: entity.name }),
    ...(entity.tag === undefined ? {} : { tag: entity.tag }),
    components,
  }
}

function serializeComponent(component: Component): { [key: string]: JsonValue } | undefined {
  const serialized = serializeValue(component)
  if (!isRecord(serialized)) return undefined

  delete serialized.type
  return serialized
}

function serializeValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'function' || typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    return undefined
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry) ?? null)
  }

  if (!isRecord(value)) return undefined

  const result: { [key: string]: JsonValue } = {}
  for (const [key, entry] of Object.entries(value)) {
    const serialized = serializeValue(entry)
    if (serialized !== undefined) result[key] = serialized
  }

  return result
}

function readEntity(value: unknown): SerializedEntity | undefined {
  if (!isRecord(value)) return undefined

  const { id } = value
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0 || !isRecord(value.components)) {
    return undefined
  }
  if (value.name !== undefined && typeof value.name !== 'string') return undefined
  if (value.tag !== undefined && typeof value.tag !== 'string') return undefined

  const components: SerializedEntity['components'] = {}
  for (const [type, component] of Object.entries(value.components)) {
    if (!isRecord(component) || !isJsonValue(component)) continue
    components[type] = component
  }

  return {
    id,
    ...(value.name === undefined ? {} : { name: value.name }),
    ...(value.tag === undefined ? {} : { tag: value.tag }),
    components,
  }
}

export function restoreComponent(type: string, data: { [key: string]: JsonValue }): Component | undefined {
  if (!type) return undefined
  return { ...data, type } as Component
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!isRecord(value)) return false
  return Object.values(value).every(isJsonValue)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

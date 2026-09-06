import { createPrefab, type Prefab } from '../engine/core/Prefab.ts'
import type { Component } from '../engine/components/Component.ts'
import type { Entity } from '../engine/core/Entity.ts'
import { restoreComponent, serializeEntities } from '../engine/core/SceneSerialization.ts'
import type { JsonValue } from '../engine/core/SceneSerialization.ts'

export interface StoredPrefabData {
  name: string
  entityName?: string
  tag?: string
  components: Record<string, { [key: string]: JsonValue }>
}

interface PrefabStorePayload {
  version: 1
  prefabs: StoredPrefabData[]
}

const STORAGE_KEY = 'trion.prefabs.v1'

/**
 * Editor-only prefab asset storage. Persists component snapshots captured
 * through the existing scene serialization and rebuilds Prefab instances
 * through the existing Prefab system. Never part of Scene state.
 */
export class PrefabStore {
  private readonly prefabs = new Map<string, StoredPrefabData>()

  constructor() {
    this.load()
  }

  listNames(): string[] {
    return [...this.prefabs.keys()].sort((a, b) => a.localeCompare(b))
  }

  has(name: string): boolean {
    return this.prefabs.has(name)
  }

  get(name: string): StoredPrefabData | undefined {
    return this.prefabs.get(name)
  }

  save(record: StoredPrefabData): void {
    this.prefabs.set(record.name, {
      name: record.name,
      ...(record.entityName === undefined ? {} : { entityName: record.entityName }),
      ...(record.tag === undefined ? {} : { tag: record.tag }),
      components: { ...record.components },
    })
    this.persist()
  }

  remove(name: string): boolean {
    const removed = this.prefabs.delete(name)
    if (removed) this.persist()
    return removed
  }

  toPrefab(name: string): Prefab | undefined {
    const record = this.prefabs.get(name)
    if (!record) return undefined
    const components: Component[] = []
    for (const [type, data] of Object.entries(record.components)) {
      const component = restoreComponent(type, data)
      if (component) components.push(component)
    }
    return createPrefab(components)
  }

  static entityToData(entity: Entity, name: string): StoredPrefabData {
    const [record] = serializeEntities([entity]).entities
    return {
      name,
      ...(record?.name === undefined ? {} : { entityName: record.name }),
      ...(record?.tag === undefined ? {} : { tag: record.tag }),
      components: record?.components ?? {},
    }
  }

  private load(): void {
    try {
      if (typeof localStorage === 'undefined') return
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const payload = JSON.parse(raw) as Partial<PrefabStorePayload>
      if (payload.version !== 1 || !Array.isArray(payload.prefabs)) return
      for (const entry of payload.prefabs) {
        if (isStoredPrefabData(entry)) {
          this.prefabs.set(entry.name, entry)
        }
      }
    } catch {
      this.prefabs.clear()
    }
  }

  private persist(): void {
    try {
      const payload: PrefabStorePayload = { version: 1, prefabs: [...this.prefabs.values()] }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn('[PrefabStore] Failed to persist prefabs:', error)
    }
  }
}

function isStoredPrefabData(value: unknown): value is StoredPrefabData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || record.name.length === 0) return false
  if (record.entityName !== undefined && typeof record.entityName !== 'string') return false
  if (record.tag !== undefined && typeof record.tag !== 'string') return false
  if (typeof record.components !== 'object' || record.components === null || Array.isArray(record.components)) {
    return false
  }
  return true
}

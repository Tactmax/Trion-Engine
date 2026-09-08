import type { Component } from '../engine/components/Component.ts'
import type { EntityMetadata } from '../engine/core/Entity.ts'
import type { Scene } from '../engine/core/Scene.ts'
import { cloneComponent } from './EditorHistory.ts'

export interface DuplicatedEntityRecord {
  id: number
  name?: string
  tag?: string
  components: Component[]
}

export interface DuplicateResult {
  rootId: number
  sourceId: number
  records: DuplicatedEntityRecord[]
}

function readParentId(entity: { getAllComponents(): Component[] }): number | null {
  for (const component of entity.getAllComponents()) {
    const record = component as unknown as Record<string, unknown>
    for (const key of ['parent', 'parentId']) {
      const value = record[key]
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
    }
  }
  return null
}

function remapParentRefs(components: Component[], idMap: Map<number, number>): void {
  const remap = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const entry of value) remap(entry)
      return
    }
    if (typeof value !== 'object' || value === null) return
    const record = value as Record<string, unknown>
    for (const key of ['parent', 'parentId']) {
      const current = record[key]
      if (typeof current === 'number' && idMap.has(current)) {
        record[key] = idMap.get(current)!
      }
    }
    for (const child of Object.values(record)) remap(child)
  }
  for (const component of components) {
    if ((component as { type?: unknown }).type === undefined) continue
    remap(component)
  }
}

function collectSubtree(scene: Scene, rootId: number): number[] {
  const root = scene.getEntity(rootId)
  if (!root) return []
  const childrenByParent = new Map<number, number[]>()
  for (const entity of scene.getAllEntities()) {
    if (entity.id === rootId) continue
    const parentId = readParentId(entity)
    if (parentId === null) continue
    const list = childrenByParent.get(parentId) ?? []
    list.push(entity.id)
    childrenByParent.set(parentId, list)
  }
  const ordered: number[] = [rootId]
  const queue: number[] = [rootId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const childId of childrenByParent.get(current) ?? []) {
      if (ordered.includes(childId)) continue
      ordered.push(childId)
      queue.push(childId)
    }
  }
  return ordered
}

/**
 * Duplicate an entity and its descendant hierarchy (when parent links exist)
 * into new entities with fresh IDs. Components are generically cloned so all
 * current and future component types are preserved with identical local data.
 * Prefab instances are plain entities in the Scene, so duplicates are plain
 * entities too — no prefab linkage is created or broken.
 */
export function duplicateEntitySubtree(
  scene: Scene,
  sourceId: number,
  resolveName?: (base: string) => string,
): DuplicateResult | null {
  const source = scene.getEntity(sourceId)
  if (!source) return null
  const subtree = collectSubtree(scene, sourceId)
  if (subtree.length === 0) return null

  const idMap = new Map<number, number>()
  const pending: Array<{ sourceId: number; entityId: number; metadata: EntityMetadata; components: Component[] }> = []

  for (const oldId of subtree) {
    const current = scene.getEntity(oldId)
    if (!current) continue
    const baseName = current.name ?? `Entity ${oldId}`
    const metadata: EntityMetadata = {
      ...(current.name === undefined ? {} : { name: resolveName ? resolveName(baseName) : baseName }),
      ...(current.tag === undefined ? {} : { tag: current.tag }),
    }
    const components = current.getAllComponents().map((c) => cloneComponent(c))
    const created = scene.createEntity(metadata)
    idMap.set(oldId, created.id)
    pending.push({ sourceId: oldId, entityId: created.id, metadata, components })
  }

  const records: DuplicatedEntityRecord[] = []
  for (const entry of pending) {
    remapParentRefs(entry.components, idMap)
    const entity = scene.getEntity(entry.entityId)
    if (!entity) continue
    for (const component of entry.components) {
      entity.addComponent(component)
    }
    records.push({
      id: entry.entityId,
      ...(entry.metadata.name === undefined ? {} : { name: entry.metadata.name }),
      ...(entry.metadata.tag === undefined ? {} : { tag: entry.metadata.tag }),
      components: entry.components.map((c) => cloneComponent(c)),
    })
  }

  const rootId = idMap.get(sourceId)
  if (rootId === undefined || records.length === 0) return null
  return { rootId, sourceId, records }
}

export function destroyDuplicatedEntities(scene: Scene, ids: number[]): void {
  for (const id of ids) {
    scene.destroyEntity(id)
  }
}

export function restoreDuplicatedEntities(scene: Scene, records: DuplicatedEntityRecord[]): void {
  const sceneWithId = scene as unknown as {
    createEntityWithId(id: number, metadata?: EntityMetadata): { id: number; addComponent(c: Component): void }
  }
  for (const record of records) {
    if (scene.getEntity(record.id)) continue
    const recreated = sceneWithId.createEntityWithId(record.id, { name: record.name, tag: record.tag })
    for (const component of record.components) {
      recreated.addComponent(cloneComponent(component))
    }
  }
}

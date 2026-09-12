import type { Entity } from '../engine/index.ts'

/** Default base name for newly created folders. Unique suffixes append via uniqueEntityName. */
export const GROUP_BASE_NAME = 'New Folder'

const RENDERABLE_COMPONENTS = new Set([
  'meshRenderer',
  'directionalLight',
  'pointLight',
  'spotLight',
  'camera',
  'animation',
  'ui',
  'uiText',
  'uiButton',
])

/**
 * A folder is an organizational entity: it carries no renderable component,
 * so no mesh/light/camera/UI is ever created for it. Folders reuse the
 * existing entity/parenting architecture (transform + optional hierarchy
 * link) and therefore persist, duplicate, reparent and serialize like any
 * other entity.
 */
export function isGroupEntity(entity: Entity): boolean {
  for (const component of entity.getAllComponents()) {
    if (component.type === 'transform' || component.type === 'hierarchy') continue
    if (RENDERABLE_COMPONENTS.has(component.type)) return false
  }
  return true
}

export function displayNameFor(entity: { id: number; name?: string }): string {
  return entity.name?.trim() || `Entity ${entity.id}`
}

export interface HierarchyLinkReader {
  (entityId: number): number | null
}

/**
 * Filter entities by a case-insensitive name query while keeping the
 * ancestor path of every match visible. Returns the visible subset in the
 * original order. An empty/blank query returns all entities unchanged.
 * Pure function: never modifies ECS/Scene state.
 */
export function filterHierarchyBySearch<T extends { id: number; name?: string }>(
  entities: T[],
  query: string,
  getParentId: (entityId: number) => number | null,
): T[] {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return entities
  const byId = new Map<number, T>()
  for (const entity of entities) byId.set(entity.id, entity)

  const matches = new Set<number>()
  for (const entity of entities) {
    const name = displayNameFor(entity).toLowerCase()
    if (name.includes(q) || String(entity.id).includes(q)) {
      matches.add(entity.id)
    }
  }
  if (matches.size === 0) return []

  const visible = new Set<number>(matches)
  for (const id of matches) {
    const seen = new Set<number>([id])
    let current = getParentId(id)
    while (current !== null && !seen.has(current) && byId.has(current)) {
      visible.add(current)
      seen.add(current)
      current = getParentId(current)
    }
  }
  return entities.filter((entity) => visible.has(entity.id))
}

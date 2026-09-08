import * as THREE from 'three'
import type { Component } from './Component.ts'
import type { Scene } from '../core/Scene.ts'
import type { Entity } from '../core/Entity.ts'
import type { TransformComponent, Vec3 } from './Transform.ts'

/**
 * Parent link for the editor scene hierarchy. An entity without this
 * component is a hierarchy root; otherwise `parent` holds the parent
 * entity ID. Serialized through the existing scene serialization like any
 * other component, so no separate naming/hierarchy store exists.
 */
export interface HierarchyComponent extends Component {
  type: 'hierarchy'
  parent: number | null
}

export function createHierarchy(parent: number | null = null): HierarchyComponent {
  return { type: 'hierarchy', parent }
}

/** Read the canonical parent link. Dangling/missing links resolve to null (root). */
export function readHierarchyParent(entity: Entity): number | null {
  const component = entity.getComponent<HierarchyComponent>('hierarchy') as
    | (HierarchyComponent & { parentId?: unknown })
    | undefined
  if (!component) return null
  const raw = component.parent ?? component.parentId ?? null
  return typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : null
}

export function getParentId(scene: Scene, entityId: number): number | null {
  const entity = scene.getEntity(entityId)
  if (!entity) return null
  const parentId = readHierarchyParent(entity)
  if (parentId === null || parentId === entityId) return null
  return scene.getEntity(parentId) ? parentId : null
}

/** Direct children in scene (insertion) order. Deterministic; no separate ordering store. */
export function getChildren(scene: Scene, parentId: number): Entity[] {
  const out: Entity[] = []
  for (const entity of scene.getAllEntities()) {
    if (entity.id === parentId) continue
    if (getParentId(scene, entity.id) === parentId) out.push(entity)
  }
  return out
}

export function isDescendantOf(scene: Scene, maybeDescendantId: number, ancestorId: number): boolean {
  const seen = new Set<number>()
  let current = getParentId(scene, maybeDescendantId)
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true
    seen.add(current)
    current = getParentId(scene, current)
  }
  return false
}

export interface ReparentCheck {
  ok: boolean
  reason?: 'unknown-entity' | 'unknown-parent' | 'self-parent' | 'descendant-parent'
}

/** Reject operations that would break the hierarchy tree. No side effects. */
export function canReparent(scene: Scene, childId: number, newParentId: number | null): ReparentCheck {
  if (!scene.getEntity(childId)) return { ok: false, reason: 'unknown-entity' }
  if (newParentId === null) return { ok: true }
  if (!scene.getEntity(newParentId)) return { ok: false, reason: 'unknown-parent' }
  if (newParentId === childId) return { ok: false, reason: 'self-parent' }
  if (isDescendantOf(scene, newParentId, childId)) return { ok: false, reason: 'descendant-parent' }
  return { ok: true }
}

/** Attach or detach the parent link. Parent validity must be checked with canReparent first. */
export function applyParentLink(entity: Entity, newParentId: number | null): void {
  if (newParentId === null) {
    entity.removeComponent('hierarchy')
    return
  }
  const existing = entity.getComponent<HierarchyComponent>('hierarchy')
  if (existing) {
    existing.parent = newParentId
    return
  }
  entity.addComponent(createHierarchy(newParentId))
}

export interface TransformSnapshot {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

function localMatrixOf(transform: TransformComponent | undefined): THREE.Matrix4 {
  const p = transform?.position ?? { x: 0, y: 0, z: 0 }
  const r = transform?.rotation ?? { x: 0, y: 0, z: 0 }
  const s = transform?.scale ?? { x: 1, y: 1, z: 1 }
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, p.y, p.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(r.x, r.y, r.z, 'XYZ')),
    new THREE.Vector3(s.x, s.y, s.z),
  )
}

/**
 * World matrix of an entity, composed root-first from ECS local transforms.
 * Entities without a Transform contribute identity. Cycles and dangling
 * links terminate the walk instead of looping.
 */
export function getWorldMatrix(scene: Scene, entityId: number): THREE.Matrix4 {
  const chain: number[] = []
  const seen = new Set<number>()
  let current: number | null = entityId
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = getParentId(scene, current)
  }
  const out = new THREE.Matrix4()
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const entity = scene.getEntity(chain[i])
    out.multiply(localMatrixOf(entity?.getComponent<TransformComponent>('transform')))
  }
  return out
}

export function decomposeMatrix(matrix: THREE.Matrix4): TransformSnapshot {
  const position = new THREE.Vector3()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  matrix.decompose(position, quaternion, scale)
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
  return {
    position: { x: position.x, y: position.y, z: position.z },
    rotation: { x: euler.x, y: euler.y, z: euler.z },
    scale: { x: scale.x, y: scale.y, z: scale.z },
  }
}

/** World-space transform with a fast path for hierarchy roots. */
export function getWorldTransform(scene: Scene, entityId: number): TransformSnapshot {
  const entity = scene.getEntity(entityId)
  if (!entity || getParentId(scene, entityId) === null) {
    const local = entity?.getComponent<TransformComponent>('transform')
    return {
      position: { ...(local?.position ?? { x: 0, y: 0, z: 0 }) },
      rotation: { ...(local?.rotation ?? { x: 0, y: 0, z: 0 }) },
      scale: { ...(local?.scale ?? { x: 1, y: 1, z: 1 }) },
    }
  }
  return decomposeMatrix(getWorldMatrix(scene, entityId))
}

/**
 * Local transform that keeps the entity's current world transform unchanged
 * once attached under `newParentId` (or detached to the root for null).
 */
export function computePreservedLocal(
  scene: Scene,
  childId: number,
  newParentId: number | null,
): TransformSnapshot {
  const world = getWorldMatrix(scene, childId)
  const parentWorld = newParentId === null ? new THREE.Matrix4() : getWorldMatrix(scene, newParentId)
  return decomposeMatrix(parentWorld.invert().multiply(world))
}

/**
 * Convert a world-space matrix (e.g. from a gizmo-driven Three.js object in
 * the flat renderer scene) back into the entity's local ECS transform.
 */
export function worldToLocal(scene: Scene, entityId: number, world: THREE.Matrix4): TransformSnapshot {
  const parentId = getParentId(scene, entityId)
  const parentWorld = parentId === null ? new THREE.Matrix4() : getWorldMatrix(scene, parentId)
  return decomposeMatrix(parentWorld.invert().multiply(world.clone()))
}

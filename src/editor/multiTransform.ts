import * as THREE from 'three'
import type { Scene } from '../engine/core/Scene.ts'
import type { TransformComponent } from '../engine/components/Transform.ts'
import { createTransform } from '../engine/components/Transform.ts'
import { decomposeMatrix, getParentId, getWorldMatrix, getWorldTransform } from '../engine/components/Hierarchy.ts'
import type { TransformData } from './EditorHistory.ts'

export interface GroupDragSnapshot {
  proxy: THREE.Matrix4
  worlds: Map<number, THREE.Matrix4>
}

/** Average of world-space positions. Cheap pivot for group manipulation. */
export function computeGroupPivot(positions: Array<{ x: number; y: number; z: number }>): THREE.Vector3 {
  const pivot = new THREE.Vector3()
  if (positions.length === 0) return pivot
  for (const position of positions) {
    pivot.x += position.x
    pivot.y += position.y
    pivot.z += position.z
  }
  return pivot.multiplyScalar(1 / positions.length)
}

/** World-space pivot (average position) of the given entities. */
export function computeSelectionPivot(scene: Scene, entityIds: number[]): THREE.Vector3 {
  const positions: Array<{ x: number; y: number; z: number }> = []
  for (const id of entityIds) {
    if (!scene.getEntity(id)) continue
    positions.push(getWorldTransform(scene, id).position)
  }
  return computeGroupPivot(positions)
}

/** Capture the proxy matrix plus one world matrix per entity at drag start. */
export function snapshotGroupWorlds(scene: Scene, entityIds: number[], proxy: THREE.Object3D): GroupDragSnapshot {
  const worlds = new Map<number, THREE.Matrix4>()
  for (const id of entityIds) {
    if (!scene.getEntity(id)) continue
    worlds.set(id, getWorldMatrix(scene, id))
  }
  proxy.updateMatrixWorld()
  return { proxy: proxy.matrixWorld.clone(), worlds }
}

/**
 * Map each start world matrix through the proxy delta
 * (current * inverse(start)) so the whole group moves as one rigid frame.
 */
export function applyProxyDeltaToWorlds(snapshot: GroupDragSnapshot, proxy: THREE.Object3D): Map<number, THREE.Matrix4> {
  proxy.updateMatrixWorld()
  const delta = proxy.matrixWorld.clone().multiply(snapshot.proxy.clone().invert())
  const out = new Map<number, THREE.Matrix4>()
  for (const [id, world] of snapshot.worlds) {
    out.set(id, delta.clone().multiply(world))
  }
  return out
}

/**
 * Write world matrices back to ECS local transforms. Parents that are also
 * in the moved set contribute their new world matrix, so nested selections
 * stay order-independent and relative arrangement is preserved.
 */
export function writeWorldsToLocals(scene: Scene, worlds: Map<number, THREE.Matrix4>): void {
  const parentWorlds = new Map<number, THREE.Matrix4>()
  for (const id of worlds.keys()) {
    const parentId = getParentId(scene, id)
    if (parentId === null || parentWorlds.has(parentId)) continue
    parentWorlds.set(parentId, worlds.get(parentId) ?? getWorldMatrix(scene, parentId))
  }
  for (const [id, world] of worlds) {
    const entity = scene.getEntity(id)
    if (!entity) continue
    const parentId = getParentId(scene, id)
    const parentWorld = parentId === null
      ? new THREE.Matrix4()
      : (parentWorlds.get(parentId) ?? getWorldMatrix(scene, parentId))
    const local = decomposeMatrix(parentWorld.clone().invert().multiply(world.clone()))
    let transform = entity.getComponent<TransformComponent>('transform')
    if (!transform) {
      transform = createTransform()
      entity.addComponent(transform)
    }
    transform.position.x = local.position.x
    transform.position.y = local.position.y
    transform.position.z = local.position.z
    transform.rotation.x = local.rotation.x
    transform.rotation.y = local.rotation.y
    transform.rotation.z = local.rotation.z
    transform.scale.x = local.scale.x
    transform.scale.y = local.scale.y
    transform.scale.z = local.scale.z
  }
}

/** Local ECS transform snapshot for history. Null when the entity has none. */
export function snapshotLocalTransform(scene: Scene, entityId: number): TransformData | null {
  const transform = scene.getEntity(entityId)?.getComponent<TransformComponent>('transform')
  if (!transform) return null
  return {
    position: { ...transform.position },
    rotation: { ...transform.rotation },
    scale: { ...transform.scale },
  }
}

/** Restore a local ECS transform snapshot, creating the component when needed. */
export function writeLocalTransform(scene: Scene, entityId: number, data: TransformData | null): void {
  const entity = scene.getEntity(entityId)
  if (!entity) return
  if (!data) {
    entity.removeComponent('transform')
    return
  }
  let transform = entity.getComponent<TransformComponent>('transform')
  if (!transform) {
    transform = createTransform()
    entity.addComponent(transform)
  }
  transform.position.x = data.position.x
  transform.position.y = data.position.y
  transform.position.z = data.position.z
  transform.rotation.x = data.rotation.x
  transform.rotation.y = data.rotation.y
  transform.rotation.z = data.rotation.z
  transform.scale.x = data.scale.x
  transform.scale.y = data.scale.y
  transform.scale.z = data.scale.z
}

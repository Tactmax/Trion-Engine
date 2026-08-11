import * as THREE from 'three'
import type { Scene } from '../core/Scene.ts'
import type { TransformComponent } from '../components/Transform.ts'
import type { MeshRendererComponent } from '../components/MeshRenderer.ts'
import type { AssetManager } from './AssetManager.ts'
import type { Renderer } from './Renderer.ts'

/**
 * Per-entity record stored in the system's mesh cache.
 * Tracks the geometry and material IDs that were used to build the mesh
 * so that runtime asset-ID changes can be detected and the mesh rebuilt.
 */
interface MeshEntry {
  mesh: THREE.Mesh
  geometryId: string
  materialId: string
}

/**
 * Bridges the ECS and the Three.js scene for renderable entities.
 *
 * Responsibilities:
 *   - Lazy-create THREE.Mesh instances when geometry + material are both available.
 *   - Synchronize TransformComponent → mesh position / rotation / scale every frame.
 *   - Detect runtime asset-ID changes and rebuild affected meshes.
 *   - Remove meshes when their entity is destroyed or loses the meshRenderer component.
 *
 * Ownership:
 *   - MeshRendererSystem owns the THREE.Mesh instances (MeshEntry cache).
 *   - AssetManager owns the underlying geometry and material; never dispose them here.
 *   - Renderer owns the scene slot; addMesh / removeMesh are the only scene mutations.
 *
 * Call sync() once per frame from engine.onPostUpdate, before renderer.render().
 */
export class MeshRendererSystem {
  private readonly scene: Scene
  private readonly assets: AssetManager
  private readonly renderer: Renderer
  private readonly cache = new Map<number, MeshEntry>()

  constructor(scene: Scene, assets: AssetManager, renderer: Renderer) {
    this.scene = scene
    this.assets = assets
    this.renderer = renderer
  }

  sync(): void {
    this.updateMeshes()
    this.removeStaleMeshes()
  }

  ensureMesh(entityId: number): THREE.Mesh | undefined {
    const entity = this.scene.getEntity(entityId)
    if (!entity) return undefined

    const mr = entity.getComponent<MeshRendererComponent>('meshRenderer')
    if (!mr) return undefined

    const geo = this.assets.getGeometry(mr.geometryId)
    const mat = this.assets.getMaterial(mr.materialId)
    if (!geo || !mat) return undefined

    return this.resolveOrRebuildMesh(entityId, mr, geo, mat)
  }

  getMesh(entityId: number): THREE.Mesh | undefined {
    return this.cache.get(entityId)?.mesh
  }


  private updateMeshes(): void {
    const entities = this.scene.getEntitiesWithComponent('meshRenderer')

    for (const entity of entities) {
      // Skip entities with an animation component — AnimationSystem owns their
      // scene-graph placement and transform sync.
      if (entity.hasComponent('animation')) continue

      const mr = entity.getComponent<MeshRendererComponent>('meshRenderer')!
      const geo = this.assets.getGeometry(mr.geometryId)
      const mat = this.assets.getMaterial(mr.materialId)

      // Skip silently if assets are not yet registered.
      // The mesh will be created automatically on the next sync where both are present.
      if (!geo || !mat) continue

      const mesh = this.resolveOrRebuildMesh(entity.id, mr, geo, mat)

      this.syncTransform(entity.id, mesh)
      mesh.castShadow    = mr.castShadow
      mesh.receiveShadow = mr.receiveShadow
    }
  }

  /**
   * Return the cached THREE.Mesh for this entity, creating it if it does not
   * yet exist, or rebuilding it if the asset IDs changed since the last sync.
   */
  private resolveOrRebuildMesh(
    entityId: number,
    mr: MeshRendererComponent,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
  ): THREE.Mesh {
    const cached = this.cache.get(entityId)

    const idsUnchanged =
      cached &&
      cached.geometryId === mr.geometryId &&
      cached.materialId === mr.materialId

    if (idsUnchanged && cached!.mesh.parent) return cached!.mesh

    // First creation, asset-ID change, or mesh was orphaned by animation
    // cleanup — (re)build the mesh and add it to the scene.
    // Use SkinnedMesh if the geometry has skinning data so bone animations
    // can deform the mesh; otherwise use a regular Mesh.
    this.renderer.removeMesh(entityId)
    const isSkinned = geo.hasAttribute('skinIndex')
    const mesh = isSkinned ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat)
    this.renderer.addMesh(entityId, mesh)
    this.cache.set(entityId, { mesh, geometryId: mr.geometryId, materialId: mr.materialId })
    return mesh
  }

  /**
   * Copy the entity's TransformComponent into the Three.js mesh.
   * TransformComponent rotation is stored as Euler angles in radians (XYZ order).
   * No-op if the entity has no Transform — the mesh stays at the origin.
   */
  private syncTransform(entityId: number, mesh: THREE.Mesh): void {
    const entity = this.scene.getEntity(entityId)
    const xform = entity?.getComponent<TransformComponent>('transform')
    if (!xform) return

    mesh.position.set(xform.position.x, xform.position.y, xform.position.z)
    mesh.rotation.set(xform.rotation.x, xform.rotation.y, xform.rotation.z)
    mesh.scale.set(xform.scale.x, xform.scale.y, xform.scale.z)
  }


  /**
   * Detect entities whose mesh should no longer be in the scene:
   *   - Entity was destroyed (scene.getEntity returns undefined).
   *   - MeshRenderer component was removed from the entity.
   *
   * Stale IDs are collected before deletion to avoid mutating the Map mid-iteration.
   */
  private removeStaleMeshes(): void {
    const staleIds: number[] = []

    for (const entityId of this.cache.keys()) {
      const entity = this.scene.getEntity(entityId)
      if (!entity || !entity.hasComponent('meshRenderer')) {
        staleIds.push(entityId)
      }
    }

    for (const id of staleIds) {
      this.renderer.removeMesh(id)
      this.cache.delete(id)
    }
  }
}

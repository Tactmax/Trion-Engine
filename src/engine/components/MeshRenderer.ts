import type { Component } from './Component.ts'

/**
 * Pure ECS data that describes how an entity should be rendered.
 *
 * This component stores only asset IDs and rendering flags — no Three.js
 * objects, no geometry data, no material instances.
 *
 * Asset ID resolution happens inside MeshRendererSystem (graphics layer):
 *   geometryId → AssetRegistry.getGeometry(id) → THREE.BufferGeometry
 *   materialId → AssetRegistry.getMaterial(id)  → THREE.Material
 *
 * Sync path (implemented when MeshRendererSystem arrives):
 *   1. Resolve geometryId / materialId via the asset registry.
 *   2. Lazy-create a THREE.Mesh owned by the system (Map<entityId, THREE.Mesh>).
 *   3. Copy TransformComponent → mesh.position / rotation / scale each frame.
 *   4. Apply castShadow / receiveShadow flags.
 *   5. On entity destruction: remove mesh from scene, dispose geometry + material.
 */
export interface MeshRendererComponent extends Component {
  readonly type: 'meshRenderer'
  /** Key into the asset registry that resolves to a THREE.BufferGeometry. */
  geometryId: string
  /** Key into the asset registry that resolves to a THREE.Material. */
  materialId: string
  /** Whether this mesh casts shadows onto other objects. */
  castShadow: boolean
  /** Whether this mesh receives shadows cast by other objects. */
  receiveShadow: boolean
}

export interface CreateMeshRendererOptions {
  geometryId: string
  materialId: string
  castShadow?: boolean
  receiveShadow?: boolean
}

/**
 * Create a MeshRendererComponent.
 * Both geometryId and materialId are required — they must exist in the
 * asset registry before MeshRendererSystem attempts to render this entity.
 */
export function createMeshRenderer(
  options: CreateMeshRendererOptions,
): MeshRendererComponent {
  return {
    type: 'meshRenderer',
    geometryId: options.geometryId,
    materialId: options.materialId,
    castShadow: options.castShadow ?? false,
    receiveShadow: options.receiveShadow ?? false,
  }
}

import * as THREE from 'three'
import { loadGLTFMeshes } from './GLTFLoader.ts'

export interface GLTFMeshAsset {
  geometryId: string
  materialId: string
}

export interface GLTFAssetResult {
  id: string
  meshes: GLTFMeshAsset[]
}

/**
 * Owns all registered geometry and material GPU resources.
 *
 * Ownership rules:
 *   - Caller transfers ownership on register(). Do not dispose externally.
 *   - MeshRendererSystem borrows references via get*(). It does not own them.
 *   - remove*() and dispose() are the only paths that free GPU memory.
 *
 * AssetManager is intentionally separate from Renderer:
 *   - Renderer owns the draw pipeline (WebGL context, scene graph).
 *   - AssetManager owns GPU data (geometry buffers, material shaders).
 *   - Both are peers instantiated by the caller and injected into systems.
 */
export class AssetManager {
  private readonly geometries = new Map<string, THREE.BufferGeometry>()
  private readonly materials = new Map<string, THREE.Material>()
  private readonly gltfAssets = new Map<string, GLTFAssetResult>()

  /**
   * Load static meshes from a GLTF or GLB file.
   *
   * Each mesh receives `${id}/mesh/<index>` and `${id}/material/<index>` IDs.
   * Multi-material meshes use their first material for the complete geometry,
   * because MeshRendererComponent currently accepts one material ID.
   */
  async loadGLTF(id: string, url: string): Promise<GLTFAssetResult> {
    try {
      const loadedMeshes = await loadGLTFMeshes(url)
      if (loadedMeshes.length === 0) {
        throw new Error('The file contains no renderable meshes')
      }

      const result: GLTFAssetResult = {
        id,
        meshes: loadedMeshes.map((_, index) => ({
          geometryId: `${id}/mesh/${index}`,
          materialId: `${id}/material/${index}`,
        })),
      }

      this.assertGLTFIdsAvailable(id, result)
      this.removeGLTFAssets(id)

      const registered: GLTFMeshAsset[] = []
      try {
        for (const [index, mesh] of loadedMeshes.entries()) {
          const asset = result.meshes[index]
          registered.push(asset)
          this.registerGeometry(asset.geometryId, mesh.geometry)
          this.registerMaterial(asset.materialId, mesh.material)
        }
      } catch (error) {
        for (const asset of registered) {
          this.removeGeometry(asset.geometryId)
          this.removeMaterial(asset.materialId)
        }
        throw error
      }

      this.gltfAssets.set(id, result)
      return result
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load GLTF asset "${id}" from "${url}": ${detail}`, { cause: error })
    }
  }

  // -------------------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------------------

  /**
   * Register a geometry under a string ID.
   * Ownership transfers to AssetManager — do not dispose the geometry externally.
   * Overwrites any previously registered geometry with the same ID (disposing the old one).
   */
  registerGeometry(id: string, geometry: THREE.BufferGeometry): void {
    const existing = this.geometries.get(id)
    if (existing) existing.dispose()
    this.geometries.set(id, geometry)
  }

  /** Retrieve a geometry by ID. Returns undefined if not registered. */
  getGeometry(id: string): THREE.BufferGeometry | undefined {
    return this.geometries.get(id)
  }

  hasGeometry(id: string): boolean {
    return this.geometries.has(id)
  }

  /**
   * Remove and dispose a geometry by ID.
   * Any THREE.Mesh still referencing this geometry will render incorrectly.
   * MeshRendererSystem must rebuild affected meshes after removal.
   */
  removeGeometry(id: string): void {
    const geometry = this.geometries.get(id)
    if (geometry) {
      geometry.dispose()
      this.geometries.delete(id)
    }
  }

  // -------------------------------------------------------------------------
  // Material
  // -------------------------------------------------------------------------

  /**
   * Register a material under a string ID.
   * Ownership transfers to AssetManager — do not dispose the material externally.
   * Overwrites any previously registered material with the same ID (disposing the old one).
   */
  registerMaterial(id: string, material: THREE.Material): void {
    const existing = this.materials.get(id)
    if (existing) existing.dispose()
    this.materials.set(id, material)
  }

  /** Retrieve a material by ID. Returns undefined if not registered. */
  getMaterial(id: string): THREE.Material | undefined {
    return this.materials.get(id)
  }

  hasMaterial(id: string): boolean {
    return this.materials.has(id)
  }

  /**
   * Remove and dispose a material by ID.
   * Any THREE.Mesh still referencing this material will render incorrectly.
   * MeshRendererSystem must rebuild affected meshes after removal.
   */
  removeMaterial(id: string): void {
    const material = this.materials.get(id)
    if (material) {
      material.dispose()
      this.materials.delete(id)
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Dispose all registered geometries and materials and clear both registries. */
  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose()
    for (const material of this.materials.values()) material.dispose()
    this.geometries.clear()
    this.materials.clear()
    this.gltfAssets.clear()
  }

  private assertGLTFIdsAvailable(id: string, result: GLTFAssetResult): void {
    const existing = this.gltfAssets.get(id)
    const ownedGeometryIds = new Set(existing?.meshes.map((mesh) => mesh.geometryId))
    const ownedMaterialIds = new Set(existing?.meshes.map((mesh) => mesh.materialId))

    for (const mesh of result.meshes) {
      if (this.geometries.has(mesh.geometryId) && !ownedGeometryIds.has(mesh.geometryId)) {
        throw new Error(`Geometry ID "${mesh.geometryId}" is already registered`)
      }
      if (this.materials.has(mesh.materialId) && !ownedMaterialIds.has(mesh.materialId)) {
        throw new Error(`Material ID "${mesh.materialId}" is already registered`)
      }
    }
  }

  private removeGLTFAssets(id: string): void {
    const existing = this.gltfAssets.get(id)
    if (!existing) return

    for (const mesh of existing.meshes) {
      this.removeGeometry(mesh.geometryId)
      this.removeMaterial(mesh.materialId)
    }
    this.gltfAssets.delete(id)
  }
}

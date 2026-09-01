import * as THREE from 'three'
import { loadGLTFAsset } from './GLTFLoader.ts'

export interface GLTFMeshAsset {
  geometryId: string
  materialId: string
}

export interface GLTFAssetResult {
  id: string
  meshes: GLTFMeshAsset[]
  animations: string[]
}

export interface CreateStandardMaterialOptions extends Omit<THREE.MeshStandardMaterialParameters, 'map'> {
  map?: string
}

/**
 * Owns all registered geometry, material and texture GPU resources.
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
  private readonly textures = new Map<string, THREE.Texture>()
  private readonly animations = new Map<string, THREE.AnimationClip>()
  private readonly animationRoots = new Map<string, THREE.Object3D>()
  private readonly audioBuffers = new Map<string, AudioBuffer>()
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
      const loaded = await loadGLTFAsset(url)
      if (loaded.meshes.length === 0) {
        throw new Error('The file contains no renderable meshes')
      }

      const result: GLTFAssetResult = {
        id,
        meshes: loaded.meshes.map((_, index) => ({
          geometryId: `${id}/mesh/${index}`,
          materialId: `${id}/material/${index}`,
        })),
        animations: loaded.animations.map((_, index) => `${id}/animation/${index}`),
      }

      this.assertGLTFIdsAvailable(id, result)
      this.removeGLTFAssets(id)

      const registered: GLTFMeshAsset[] = []
      try {
        for (const [index, mesh] of loaded.meshes.entries()) {
          const asset = result.meshes[index]
          registered.push(asset)
          this.registerGeometry(asset.geometryId, mesh.geometry)
          this.registerMaterial(asset.materialId, mesh.material)
        }

        for (const [index, clip] of loaded.animations.entries()) {
          const animationId = result.animations[index]
          this.registerAnimation(animationId, clip)
        }

        this.registerAnimationRoot(id, loaded.sceneRoot)
      } catch (error) {
        for (const asset of registered) {
          this.removeGeometry(asset.geometryId)
          this.removeMaterial(asset.materialId)
        }
        for (const animationId of result.animations) {
          this.removeAnimation(animationId)
        }
        this.removeAnimationRoot(id)
        throw error
      }

      this.gltfAssets.set(id, result)
      return result
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load GLTF asset "${id}" from "${url}": ${detail}`, { cause: error })
    }
  }


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


  registerAnimation(id: string, clip: THREE.AnimationClip): void {
    this.animations.set(id, clip)
  }

  getAnimation(id: string): THREE.AnimationClip | undefined {
    return this.animations.get(id)
  }

  hasAnimation(id: string): boolean {
    return this.animations.has(id)
  }

  removeAnimation(id: string): void {
    this.animations.delete(id)
  }

  registerAnimationRoot(id: string, root: THREE.Object3D): void {
    this.animationRoots.set(id, root)
  }

  getAnimationRoot(id: string): THREE.Object3D | undefined {
    return this.animationRoots.get(id)
  }

  hasAnimationRoot(id: string): boolean {
    return this.animationRoots.has(id)
  }

  removeAnimationRoot(id: string): void {
    this.animationRoots.delete(id)
  }

  /**
   * Load and register an audio buffer. Ownership transfers to AssetManager
   * only after the asynchronous load succeeds.
   */
  async loadAudio(id: string, url: string): Promise<AudioBuffer> {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const decodeContext = new AudioContext()
      try {
        const audioBuffer = await decodeContext.decodeAudioData(arrayBuffer.slice(0))
        this.registerAudioBuffer(id, audioBuffer)
        return audioBuffer
      } finally {
        await decodeContext.close()
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load audio "${id}" from "${url}": ${detail}`, { cause: error })
    }
  }

  registerAudioBuffer(id: string, audioBuffer: AudioBuffer): void {
    this.audioBuffers.set(id, audioBuffer)
  }

  getAudioBuffer(id: string): AudioBuffer | undefined {
    return this.audioBuffers.get(id)
  }

  hasAudioBuffer(id: string): boolean {
    return this.audioBuffers.has(id)
  }

  removeAudioBuffer(id: string): void {
    this.audioBuffers.delete(id)
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


  /**
   * Load and register an sRGB image texture. Ownership transfers to
   * AssetManager only after the asynchronous load succeeds.
   */
  async loadTexture(id: string, url: string): Promise<THREE.Texture> {
    try {
      const texture = await new THREE.TextureLoader().loadAsync(url)
      texture.colorSpace = THREE.SRGBColorSpace
      this.registerTexture(id, texture)
      return texture
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load texture "${id}" from "${url}": ${detail}`, { cause: error })
    }
  }

  /** Register a texture under a string ID and transfer ownership to AssetManager. */
  registerTexture(id: string, texture: THREE.Texture): void {
    const existing = this.textures.get(id)
    if (existing) existing.dispose()
    this.textures.set(id, texture)
  }

  getTexture(id: string): THREE.Texture | undefined {
    return this.textures.get(id)
  }

  hasTexture(id: string): boolean {
    return this.textures.has(id)
  }

  removeTexture(id: string): void {
    const texture = this.textures.get(id)
    if (texture) {
      texture.dispose()
      this.textures.delete(id)
    }
  }

  /**
   * Create and register a standard material whose optional map references a
   * texture already owned by this AssetManager.
   */
  createStandardMaterial(id: string, options: CreateStandardMaterialOptions = {}): THREE.MeshStandardMaterial {
    const { map: textureId, ...parameters } = options
    const map = textureId === undefined ? undefined : this.getTexture(textureId)

    if (textureId !== undefined && !map) {
      throw new Error(`Cannot create material "${id}": texture "${textureId}" is not registered`)
    }

    const material = new THREE.MeshStandardMaterial({ ...parameters, map })
    this.registerMaterial(id, material)
    return material
  }


  /** Dispose all directly registered geometries, materials, textures and animation scene graphs. */
  dispose(): void {
    for (const geometry of this.geometries.values()) geometry.dispose()
    for (const material of this.materials.values()) material.dispose()
    for (const texture of this.textures.values()) texture.dispose()

    // Dispose nested resources inside animation roots (clone'ed from GLTF
    // scene — these own separate instances from the main geometry/material maps)
    for (const root of this.animationRoots.values()) {
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose()
          if (Array.isArray(child.material)) {
            for (const mat of child.material) mat.dispose()
          } else {
            child.material?.dispose()
          }
        }
      })
    }

    this.geometries.clear()
    this.materials.clear()
    this.textures.clear()
    this.animations.clear()
    this.animationRoots.clear()
    this.audioBuffers.clear()
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
    for (const animationId of existing.animations) {
      this.removeAnimation(animationId)
    }
    this.removeAnimationRoot(id)
    this.gltfAssets.delete(id)
  }
}

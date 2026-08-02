import * as THREE from 'three'
import { GLTFLoader as ThreeGLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface LoadedGLTFMesh {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

export interface LoadedGLTFAsset {
  meshes: LoadedGLTFMesh[]
  animations: THREE.AnimationClip[]
  sceneRoot: THREE.Object3D
}

/**
 * Loads renderable meshes and animation data from a GLTF/GLB file.
 *
 * Each returned resource is cloned so its ownership can be transferred to the
 * AssetManager without sharing disposal responsibility with the loaded scene.
 */
export async function loadGLTFAsset(url: string): Promise<LoadedGLTFAsset> {
  const loader = new ThreeGLTFLoader()
  const gltf = await loader.loadAsync(url)
  const meshes: LoadedGLTFMesh[] = []

  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return

    // For multi-material meshes, use the first material for the complete
    // geometry. Full multi-material support would require per-group rendering.
    const material = Array.isArray(object.material) ? object.material[0] : object.material
    if (!material) return

    meshes.push({
      geometry: object.geometry.clone(),
      material: material.clone(),
    })
  })

  // Clone the scene root for the animation skeleton (owned by AssetManager).
  // Dispose the original loader scene so its GPU resources aren't leaked.
  const sceneRoot = gltf.scene.clone(true)
  disposeScene(gltf.scene)

  return {
    meshes,
    animations: gltf.animations ?? [],
    sceneRoot,
  }
}

/** Recursively dispose geometries and materials in a Three.js scene. */
function disposeScene(scene: THREE.Object3D): void {
  scene.traverse((child) => {
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

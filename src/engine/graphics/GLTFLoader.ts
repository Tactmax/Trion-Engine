import * as THREE from 'three'
import { GLTFLoader as ThreeGLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export interface LoadedGLTFMesh {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

/**
 * Loads static renderable meshes from a GLTF/GLB file.
 *
 * Each returned resource is cloned so its ownership can be transferred to the
 * AssetManager without sharing disposal responsibility with the loaded scene.
 */
export async function loadGLTFMeshes(url: string): Promise<LoadedGLTFMesh[]> {
  const loader = new ThreeGLTFLoader()
  const gltf = await loader.loadAsync(url)
  const meshes: LoadedGLTFMesh[] = []

  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return

    // MeshRendererComponent accepts one material. For multi-material meshes,
    // use material slot zero for the complete geometry in this first version.
    const material = Array.isArray(object.material) ? object.material[0] : object.material
    if (!material) return

    meshes.push({
      geometry: object.geometry.clone(),
      material: material.clone(),
    })
  })

  return meshes
}

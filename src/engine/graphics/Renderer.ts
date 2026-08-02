import * as THREE from 'three'

/**
 * Owns the WebGL surface and the Three.js scene graph.
 *
 * THREE.Scene is intentionally private. External code interacts with the
 * scene graph through Renderer methods.
 */
export class Renderer {
  private readonly webgl: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  /** Entity ID to THREE.Mesh map for semantic mesh lifecycle management. */
  private readonly meshes = new Map<number, THREE.Mesh>()

  private readonly onResize: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.webgl.setPixelRatio(window.devicePixelRatio)
    this.webgl.setSize(window.innerWidth, window.innerHeight)

    this.scene = new THREE.Scene()

    this.onResize = () => {
      this.webgl.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', this.onResize)
  }

  /** Set the scene's solid background color. */
  setBackground(hexColor: number): void {
    this.scene.background = new THREE.Color(hexColor)
  }

  /**
   * Return the current viewport aspect ratio (width / height).
   * Used by CameraSystem to keep the Three.js camera in sync with the canvas.
   * Derived from the WebGL renderer's own canvas so it is always authoritative.
   */
  getAspect(): number {
    const el = this.webgl.domElement
    return el.clientWidth / el.clientHeight
  }

  /** Return the underlying Three.js scene for debugging and runtime inspection. */
  getScene(): THREE.Scene {
    return this.scene
  }

  /** Add an object directly to the internal Three.js scene. */
  add(object: THREE.Object3D): void {
    this.scene.add(object)
  }

  /** Remove an object directly from the internal Three.js scene. */
  remove(object: THREE.Object3D): void {
    this.scene.remove(object)
  }

  // -------------------------------------------------------------------------
  // Entity-managed mesh lifecycle
  // -------------------------------------------------------------------------

  /**
   * Add a mesh to the scene and associate it with an entity ID.
   * Called by MeshRendererSystem when a new mesh is created for an entity.
   */
  addMesh(entityId: number, mesh: THREE.Mesh): void {
    const existing = this.meshes.get(entityId)
    if (existing) this.scene.remove(existing)
    this.meshes.set(entityId, mesh)
    this.scene.add(mesh)
  }

  /**
   * Remove the mesh associated with an entity ID from the scene.
   * Uses removeFromParent() so it works even when the mesh has been
   * reparented under an animation root by AnimationSystem.
   * Does not dispose geometry or material — those are owned by AssetManager.
   */
  removeMesh(entityId: number): void {
    const mesh = this.meshes.get(entityId)
    if (mesh) {
      mesh.removeFromParent()
      this.meshes.delete(entityId)
    }
  }

  /** Draw the current scene from the given camera's point of view. */
  render(camera: THREE.Camera): void {
    this.webgl.render(this.scene, camera)
  }

  /** Release the WebGL context, clear the mesh map, and remove the resize listener. */
  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.meshes.clear()
    this.webgl.dispose()
  }
}

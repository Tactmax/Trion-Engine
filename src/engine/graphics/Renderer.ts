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
  private readonly meshes = new Map<number, THREE.Mesh>()

  private readonly onResize: () => void
  private readonly resizeObserver: ResizeObserver

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.webgl.setPixelRatio(window.devicePixelRatio)

    this.onResize = () => {
      const width = canvas.clientWidth || window.innerWidth
      const height = canvas.clientHeight || window.innerHeight
      this.webgl.setSize(width, height, false)
    }
    this.onResize()
    window.addEventListener('resize', this.onResize)
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(canvas)

    this.scene = new THREE.Scene()
  }

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

  getScene(): THREE.Scene {
    return this.scene
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object)
  }

  remove(object: THREE.Object3D): void {
    this.scene.remove(object)
  }


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

  render(camera: THREE.Camera): void {
    this.webgl.render(this.scene, camera)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.resizeObserver.disconnect()
    this.meshes.clear()
    this.webgl.dispose()
  }
}

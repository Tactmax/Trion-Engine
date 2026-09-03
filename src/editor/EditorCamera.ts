import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class EditorCamera {
  readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly onContextMenu: (e: MouseEvent) => void
  private readonly onPointerDown: (e: PointerEvent) => void
  private readonly onPointerUp: (e: PointerEvent) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const aspect = canvas.clientWidth > 0 && canvas.clientHeight > 0
      ? canvas.clientWidth / canvas.clientHeight
      : window.innerWidth / window.innerHeight

    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000)
    this.camera.position.set(0, 3, 5)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.target.set(0, 1, 0)

    // Desktop editor interaction model:
    // - Right mouse drag -> orbit
    // - Middle mouse drag -> pan
    // - Mouse wheel -> zoom / dolly
    // - Left mouse is reserved for picking / gizmos (or Alt+Left for orbit)
    this.controls.mouseButtons = {
      LEFT: null as any,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    }

    this.onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    canvas.addEventListener('contextmenu', this.onContextMenu)

    this.onPointerDown = (e: PointerEvent) => {
      if (e.button === 0 && e.altKey) {
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE
      }
    }
    this.onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) {
        this.controls.mouseButtons.LEFT = null as any
      }
    }
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)

    this.camera.lookAt(0, 1, 0)
    this.controls.update()
  }

  update(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width > 0 && height > 0) {
      const currentAspect = width / height
      if (Math.abs(this.camera.aspect - currentAspect) > 0.001) {
        this.camera.aspect = currentAspect
        this.camera.updateProjectionMatrix()
      }
    }
    this.controls.update()
  }

  setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled
  }

  dispose(): void {
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.controls.dispose()
  }
}

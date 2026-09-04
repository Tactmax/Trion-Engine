import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class EditorCamera {
  readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly canvas: HTMLCanvasElement
  private readonly keysHeld = new Set<string>()
  private isHovered = false
  private isGizmoDragging = false
  private lastTime = performance.now()

  private readonly onContextMenu: (e: MouseEvent) => void
  private readonly onPointerDown: (e: PointerEvent) => void
  private readonly onPointerUp: (e: PointerEvent) => void
  private readonly onPointerEnter: () => void
  private readonly onPointerLeave: () => void
  private readonly onKeyDown: (e: KeyboardEvent) => void
  private readonly onKeyUp: (e: KeyboardEvent) => void
  private readonly onBlur: () => void

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

    // Invert only horizontal mouse-drag/orbit direction
    const origRotateLeft = (this.controls as any)._rotateLeft.bind(this.controls)
    ;(this.controls as any)._rotateLeft = (angle: number) => {
      origRotateLeft(-angle)
    }

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

    this.onPointerEnter = () => {
      this.isHovered = true
    }
    this.onPointerLeave = () => {
      this.isHovered = false
      this.keysHeld.clear()
    }
    canvas.addEventListener('pointerenter', this.onPointerEnter)
    canvas.addEventListener('pointerleave', this.onPointerLeave)

    this.onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        if (this.isHovered && !this.isGizmoDragging) {
          this.keysHeld.add(e.code)
        }
      }
    }
    this.onKeyUp = (e: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        this.keysHeld.delete(e.code)
      }
    }
    this.onBlur = () => {
      this.keysHeld.clear()
    }

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)

    this.camera.lookAt(0, 1, 0)
    this.controls.update()
  }

  setGizmoDragging(dragging: boolean): void {
    this.isGizmoDragging = dragging
    if (dragging) {
      this.keysHeld.clear()
    }
  }

  update(): void {
    const now = performance.now()
    const deltaTime = Math.min((now - this.lastTime) / 1000, 0.1)
    this.lastTime = now

    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width > 0 && height > 0) {
      const currentAspect = width / height
      if (Math.abs(this.camera.aspect - currentAspect) > 0.001) {
        this.camera.aspect = currentAspect
        this.camera.updateProjectionMatrix()
      }
    }

    if (this.controls.enabled && this.isHovered && !this.isGizmoDragging && this.keysHeld.size > 0) {
      const moveSpeed = 5.0 * deltaTime
      const forward = new THREE.Vector3()
      this.camera.getWorldDirection(forward)

      const right = new THREE.Vector3()
      right.crossVectors(forward, this.camera.up).normalize()

      const moveVector = new THREE.Vector3()

      if (this.keysHeld.has('KeyW')) {
        moveVector.addScaledVector(forward, moveSpeed)
      }
      if (this.keysHeld.has('KeyS')) {
        moveVector.addScaledVector(forward, -moveSpeed)
      }
      if (this.keysHeld.has('KeyD')) {
        moveVector.addScaledVector(right, moveSpeed)
      }
      if (this.keysHeld.has('KeyA')) {
        moveVector.addScaledVector(right, -moveSpeed)
      }

      if (moveVector.lengthSq() > 0) {
        this.camera.position.add(moveVector)
        this.controls.target.add(moveVector)
      }
    }

    this.controls.update()
  }

  setEnabled(enabled: boolean): void {
    this.controls.enabled = enabled
    if (!enabled) {
      this.keysHeld.clear()
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerenter', this.onPointerEnter)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.controls.dispose()
  }
}

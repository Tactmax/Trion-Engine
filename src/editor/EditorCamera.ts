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
  private isOrbitDragging = false
  private orbitDragButton: number | null = null
  private isPointerLocked = false
  private moveSpeed = 5.0

  private readonly onContextMenu: (e: MouseEvent) => void
  private readonly onPointerDown: (e: PointerEvent) => void
  private readonly onPointerUp: (e: PointerEvent) => void
  private readonly onDocumentPointerUp: (e: PointerEvent) => void
  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onPointerLockChange: () => void
  private readonly onPointerLockError: () => void
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
      const isOrbitButton = e.button === 2 || (e.button === 0 && e.altKey)
      if (isOrbitButton && this.controls.enabled && !this.isGizmoDragging) {
        this.isOrbitDragging = true
        this.orbitDragButton = e.button
        this.requestPointerLock()
      }
    }
    this.onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) {
        this.controls.mouseButtons.LEFT = null as any
      }
      if (e.button === this.orbitDragButton) {
        this.isOrbitDragging = false
        this.orbitDragButton = null
        this.exitPointerLock()
      }
    }
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointerup', this.onPointerUp)

    this.onDocumentPointerUp = (e: PointerEvent) => {
      if (e.button === this.orbitDragButton || (e.type === 'pointercancel' && this.isOrbitDragging)) {
        this.isOrbitDragging = false
        this.orbitDragButton = null
        this.exitPointerLock()
      }
      if (e.button === 0) {
        this.controls.mouseButtons.LEFT = null as any
      }
    }
    document.addEventListener('pointerup', this.onDocumentPointerUp)
    document.addEventListener('pointercancel', this.onDocumentPointerUp as unknown as (e: Event) => void)

    this.onMouseMove = (e: MouseEvent) => {
      if (!this.isPointerLocked || !this.isOrbitDragging) return
      if (!this.controls.enabled || this.isGizmoDragging) return
      const movementX = e.movementX ?? 0
      const movementY = e.movementY ?? 0
      if (movementX === 0 && movementY === 0) return
      this.rotateWithMovement(movementX, movementY)
    }
    document.addEventListener('mousemove', this.onMouseMove)

    this.onPointerLockChange = () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas
      // While locked, OrbitControls would see frozen clientX/Y (zero delta),
      // but some browsers still report movement via clientX/Y. Disable its
      // rotate so only our movementX/Y rotation applies (no double speed).
      this.controls.enableRotate = !this.isPointerLocked
    }
    document.addEventListener('pointerlockchange', this.onPointerLockChange)

    this.onPointerLockError = () => {
      // Pointer lock unavailable (iframe permissions, unsupported browser, ...).
      // Fall back to plain OrbitControls dragging.
      this.isPointerLocked = false
      this.controls.enableRotate = true
    }
    document.addEventListener('pointerlockerror', this.onPointerLockError)

    this.onPointerEnter = () => {
      this.isHovered = true
    }
    this.onPointerLeave = () => {
      // While pointer-locked the cursor can't leave; keep hover/fly keys alive.
      if (this.isPointerLocked) return
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
        if ((this.isHovered || this.isPointerLocked) && !this.isGizmoDragging) {
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

  /** WASD fly speed in world units per second. */
  setMoveSpeed(speed: number): void {
    if (Number.isFinite(speed) && speed > 0) this.moveSpeed = speed
  }

  getMoveSpeed(): number {
    return this.moveSpeed
  }

  /** OrbitControls rotate multiplier (drag orbit + pointer-lock orbit). */
  setOrbitSpeed(speed: number): void {
    if (Number.isFinite(speed) && speed > 0) this.controls.rotateSpeed = speed
  }

  getOrbitSpeed(): number {
    return this.controls.rotateSpeed
  }

  /** OrbitControls zoom multiplier. */
  setZoomSpeed(speed: number): void {
    if (Number.isFinite(speed) && speed > 0) this.controls.zoomSpeed = speed
  }

  getZoomSpeed(): number {
    return this.controls.zoomSpeed
  }

  private requestPointerLock(): void {
    try {
      const result = this.canvas.requestPointerLock() as unknown as Promise<void> | void
      if (result && typeof (result as Promise<void>).catch === 'function') {
        ;(result as Promise<void>).catch(() => {
          // Fall back to normal OrbitControls drag when lock is denied.
          this.isPointerLocked = false
          this.controls.enableRotate = true
        })
      }
    } catch {
      this.isPointerLocked = false
      this.controls.enableRotate = true
    }
  }

  private exitPointerLock(): void {
    try {
      if (document.pointerLockElement === this.canvas) {
        document.exitPointerLock()
      }
    } catch {
      // No-op: lock already released or unsupported.
    }
  }

  /**
   * Orbit the camera around its target using raw pointer deltas.
   * Mirrors OrbitControls' rotate speed (2*PI * pixels / viewport height)
   * because OrbitControls tracks frozen clientX/Y while pointer-locked.
   */
  private rotateWithMovement(movementX: number, movementY: number): void {
    const height = this.canvas.clientHeight || 1
    const rotateSpeed = this.controls.rotateSpeed ?? 1
    const thetaDelta = ((2 * Math.PI * movementX) / height) * rotateSpeed
    const phiDelta = ((2 * Math.PI * movementY) / height) * rotateSpeed

    const target = this.controls.target
    const offset = this.camera.position.clone().sub(target)
    const spherical = new THREE.Spherical().setFromVector3(offset)
    spherical.theta -= thetaDelta
    spherical.phi -= phiDelta
    spherical.phi = Math.max(
      this.controls.minPolarAngle,
      Math.min(this.controls.maxPolarAngle, spherical.phi),
    )
    spherical.makeSafe()
    offset.setFromSpherical(spherical)
    this.camera.position.copy(target).add(offset)
    this.camera.lookAt(target)
  }

  /** Current orbit focus point in world space. Used for sensible asset placement. */
  getTarget(): THREE.Vector3 {
    return this.controls.target.clone()
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

    if (this.controls.enabled && (this.isHovered || this.isPointerLocked) && !this.isGizmoDragging && this.keysHeld.size > 0) {
      const moveSpeed = this.moveSpeed * deltaTime
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
      this.isOrbitDragging = false
      this.orbitDragButton = null
      this.exitPointerLock()
    }
  }

  dispose(): void {
    this.isOrbitDragging = false
    this.orbitDragButton = null
    this.exitPointerLock()
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointerenter', this.onPointerEnter)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    document.removeEventListener('pointerup', this.onDocumentPointerUp)
    document.removeEventListener('pointercancel', this.onDocumentPointerUp as unknown as (e: Event) => void)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    document.removeEventListener('pointerlockerror', this.onPointerLockError)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.controls.dispose()
  }
}

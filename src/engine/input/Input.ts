export interface Vec2 {
  x: number
  y: number
}

/**
 * Pure engine-native Input service.
 * Manages keyboard and mouse state, hiding all DOM event details.
 *
 * Single-frame transient states (getKeyDown, getKeyUp, getMouseButtonDown,
 * getMouseButtonUp, getMouseDelta, getScrollDelta) are latched via beginFrame()
 * and cleared via endFrame() once per engine tick without timers.
 */
export class Input {
  private readonly target: HTMLElement | Window

  // Held states
  private readonly keysHeld = new Set<string>()
  private readonly buttonsHeld = new Set<number>()

  // Single-frame states (press/release)
  private readonly keysPressed = new Set<string>()
  private readonly keysReleased = new Set<string>()
  private readonly buttonsPressed = new Set<number>()
  private readonly buttonsReleased = new Set<number>()

  // Mouse position
  private mousePos: Vec2 = { x: 0, y: 0 }

  // Mouse movement deltas
  private accumMouseDelta: Vec2 = { x: 0, y: 0 }
  private frameMouseDelta: Vec2 = { x: 0, y: 0 }

  // Wheel deltas
  private accumScrollDelta: Vec2 = { x: 0, y: 0 }
  private frameScrollDelta: Vec2 = { x: 0, y: 0 }

  constructor(target: HTMLElement | Window = window) {
    this.target = target
    this.bindEvents()
  }


  /**
   * Latches accumulated asynchronous DOM events into frame-stable buffers.
   * Call once per frame at the beginning of the Engine tick before Scene update.
   */
  beginFrame(): void {
    this.frameMouseDelta = { ...this.accumMouseDelta }
    this.accumMouseDelta = { x: 0, y: 0 }

    this.frameScrollDelta = { ...this.accumScrollDelta }
    this.accumScrollDelta = { x: 0, y: 0 }
  }

  /**
   * Clears single-frame transient states (down/up triggers, deltas).
   * Call once per frame at the end of the Engine tick after rendering.
   */
  endFrame(): void {
    this.keysPressed.clear()
    this.keysReleased.clear()
    this.buttonsPressed.clear()
    this.buttonsReleased.clear()

    this.frameMouseDelta = { x: 0, y: 0 }
    this.frameScrollDelta = { x: 0, y: 0 }
  }


  /** Returns true continuously while the specified key code is held down. */
  getKey(code: string): boolean {
    return this.keysHeld.has(code)
  }

  /** Returns true only during the single frame when the key was first pressed. */
  getKeyDown(code: string): boolean {
    return this.keysPressed.has(code)
  }

  /** Returns true only during the single frame when the key was released. */
  getKeyUp(code: string): boolean {
    return this.keysReleased.has(code)
  }


  /** Returns true continuously while the mouse button is held down (0=Left, 1=Middle, 2=Right). */
  getMouseButton(button: number): boolean {
    return this.buttonsHeld.has(button)
  }

  /** Returns true only during the single frame when the mouse button was pressed. */
  getMouseButtonDown(button: number): boolean {
    return this.buttonsPressed.has(button)
  }

  /** Returns true only during the single frame when the mouse button was released. */
  getMouseButtonUp(button: number): boolean {
    return this.buttonsReleased.has(button)
  }

  /** Returns current mouse position in client coordinates { x, y }. */
  getMousePosition(): Vec2 {
    return { ...this.mousePos }
  }

  /** Returns mouse movement delta { x, y } recorded for the current frame. */
  getMouseDelta(): Vec2 {
    return { ...this.frameMouseDelta }
  }

  /** Returns mouse wheel scroll delta { x, y } recorded for the current frame. */
  getScrollDelta(): Vec2 {
    return { ...this.frameScrollDelta }
  }


  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return
    if (!this.keysHeld.has(e.code)) {
      this.keysHeld.add(e.code)
      this.keysPressed.add(e.code)
    }
  }

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code)
    this.keysReleased.add(e.code)
  }

  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.buttonsHeld.has(e.button)) {
      this.buttonsHeld.add(e.button)
      this.buttonsPressed.add(e.button)
    }
  }

  private handleMouseUp = (e: MouseEvent): void => {
    this.buttonsHeld.delete(e.button)
    this.buttonsReleased.add(e.button)
  }

  private handleMouseMove = (e: MouseEvent): void => {
    this.mousePos = { x: e.clientX, y: e.clientY }
    this.accumMouseDelta.x += e.movementX
    this.accumMouseDelta.y += e.movementY
  }

  private handleWheel = (e: WheelEvent): void => {
    this.accumScrollDelta.x += e.deltaX
    this.accumScrollDelta.y += e.deltaY
  }

  private handleBlur = (): void => {
    this.keysHeld.clear()
    this.buttonsHeld.clear()
    this.keysPressed.clear()
    this.keysReleased.clear()
    this.buttonsPressed.clear()
    this.buttonsReleased.clear()
  }


  private bindEvents(): void {
    this.target.addEventListener('keydown', this.handleKeyDown as EventListener)
    this.target.addEventListener('keyup', this.handleKeyUp as EventListener)
    this.target.addEventListener('mousedown', this.handleMouseDown as EventListener)
    this.target.addEventListener('mouseup', this.handleMouseUp as EventListener)
    this.target.addEventListener('mousemove', this.handleMouseMove as EventListener)
    this.target.addEventListener('wheel', this.handleWheel as EventListener, { passive: true })
    window.addEventListener('blur', this.handleBlur)
  }

  /** Removes all DOM event listeners and resets state. */
  dispose(): void {
    this.target.removeEventListener('keydown', this.handleKeyDown as EventListener)
    this.target.removeEventListener('keyup', this.handleKeyUp as EventListener)
    this.target.removeEventListener('mousedown', this.handleMouseDown as EventListener)
    this.target.removeEventListener('mouseup', this.handleMouseUp as EventListener)
    this.target.removeEventListener('mousemove', this.handleMouseMove as EventListener)
    this.target.removeEventListener('wheel', this.handleWheel as EventListener)
    window.removeEventListener('blur', this.handleBlur)
    this.handleBlur()
  }
}

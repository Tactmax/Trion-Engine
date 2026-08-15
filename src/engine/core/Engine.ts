import { Scene } from './Scene.ts'
import { SceneManager } from './SceneManager.ts'

export class Engine {
  readonly sceneManager = new SceneManager()

  /** Currently active ECS Scene. Convenience accessor for sceneManager.getActiveScene(). */
  get scene(): Scene {
    return this.sceneManager.getActiveScene()
  }

  /**
   * Called once per frame before scene.update(deltaTime).
   * Used by subsystems like Input to prepare/latch frame-start data.
   */
  onPreUpdate: ((deltaTime: number) => void) | null = null

  /**
   * Called once per frame after scene.update(deltaTime).
   * Assign a render pass here to keep a single requestAnimationFrame loop.
   * Engine never imports Three.js — the wiring is the caller's responsibility.
   *
   * @example
   *   engine.onPostUpdate = () => renderer.render(camera)
   */
  onPostUpdate: ((deltaTime: number) => void) | null = null

  private running = false
  private animationFrameId = 0
  private lastTime = 0

  start(): void {
    if (this.running) return

    this.running = true
    this.lastTime = performance.now()
    this.animationFrameId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.animationFrameId)
  }

  private tick = (now: number): void => {
    if (!this.running) return

    const deltaTime = (now - this.lastTime) / 1000
    this.lastTime = now

    this.onPreUpdate?.(deltaTime)
    this.scene.update(deltaTime)
    this.onPostUpdate?.(deltaTime)

    this.animationFrameId = requestAnimationFrame(this.tick)
  }
}

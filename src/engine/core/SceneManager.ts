import { Scene } from './Scene.ts'

/**
 * Runtime owner of the currently active ECS Scene.
 *
 * SceneManager is an orchestration layer: it stores, retrieves and replaces
 * a Scene reference. It does not own entities, run queries, or replace Scene.
 */
export class SceneManager {
  private activeScene: Scene | null

  constructor(initialScene?: Scene) {
    this.activeScene = initialScene ?? new Scene()
  }

  getActiveScene(): Scene {
    if (!this.activeScene) {
      throw new Error('SceneManager has no active Scene')
    }

    return this.activeScene
  }

  setActiveScene(scene: Scene): void {
    this.activeScene = scene
  }

  /**
   * Releases the active Scene reference. Does not clear or destroy the Scene.
   * The previous Scene remains valid if the caller still holds it.
   */
  dispose(): void {
    this.activeScene = null
  }
}

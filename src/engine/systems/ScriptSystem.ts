import type { Scene } from '../core/Scene.ts'
import type { Entity } from '../core/Entity.ts'
import type { ScriptComponent } from '../components/Script.ts'

interface TrackedScript {
  entity: Entity
  script: ScriptComponent
}

/**
 * Manages the lifecycle and execution of ScriptComponents attached to entities.
 * Runs in the main update phase of the engine loop.
 */
export class ScriptSystem {
  private readonly scene: Scene
  /** Map of entity ID to tracked ScriptComponent instance to handle onDestroy cleanup. */
  private readonly trackedScripts = new Map<number, TrackedScript>()

  constructor(scene: Scene) {
    this.scene = scene
  }

  /**
   * Executes script lifecycles for all entities with a ScriptComponent.
   * Call once per frame during the update step.
   */
  update(deltaTime: number): void {
    const activeEntityIds = new Set<number>()
    const entities = this.scene.getEntitiesWithComponent('script')

    for (const entity of entities) {
      const script = entity.getComponent<ScriptComponent>('script')
      if (!script) continue

      activeEntityIds.add(entity.id)

      // 1. OnStart phase (executes exactly once)
      if (!script.started) {
        script.started = true
        script.onStart?.(entity)
      }

      // Track script instance for destruction detection
      this.trackedScripts.set(entity.id, { entity, script })

      // 2. OnUpdate phase
      script.onUpdate?.(deltaTime, entity)
    }

    // 3. OnDestroy phase for entities destroyed or scripts removed
    for (const [entityId, tracked] of this.trackedScripts.entries()) {
      if (!activeEntityIds.has(entityId)) {
        tracked.script.onDestroy?.(tracked.entity)
        this.trackedScripts.delete(entityId)
      }
    }
  }

  /**
   * Triggers onDestroy for all active scripts and clears internal tracking.
   * Useful when clearing the scene.
   */
  clear(): void {
    for (const tracked of this.trackedScripts.values()) {
      tracked.script.onDestroy?.(tracked.entity)
    }
    this.trackedScripts.clear()
  }
}

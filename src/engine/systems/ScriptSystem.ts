import type { Scene } from '../core/Scene.ts'
import type { Entity } from '../core/Entity.ts'
import type { ScriptComponent } from '../components/Script.ts'
import { trionLogger } from '../core/Logger.ts'

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

      if (!script.started) {
        script.started = true
        try {
          script.onStart?.(entity)
        } catch (error) {
          trionLogger.error(`Script error in onStart (entity ${entity.id})`, { source: 'Script', error })
        }
      }

      this.trackedScripts.set(entity.id, { entity, script })

      try {
        script.onUpdate?.(deltaTime, entity)
      } catch (error) {
        trionLogger.error(`Script error in onUpdate (entity ${entity.id})`, { source: 'Script', error })
      }
    }

    for (const [entityId, tracked] of this.trackedScripts.entries()) {
      if (!activeEntityIds.has(entityId)) {
        try {
          tracked.script.onDestroy?.(tracked.entity)
        } catch (error) {
          trionLogger.error(`Script error in onDestroy (entity ${entityId})`, { source: 'Script', error })
        }
        this.trackedScripts.delete(entityId)
      }
    }
  }

  /**
   * Triggers onDestroy for all active scripts and clears internal tracking.
   * Useful when clearing the scene.
   */
  clear(): void {
    for (const [entityId, tracked] of this.trackedScripts.entries()) {
      try {
        tracked.script.onDestroy?.(tracked.entity)
      } catch (error) {
        trionLogger.error(`Script error in onDestroy (entity ${entityId})`, { source: 'Script', error })
      }
    }
    this.trackedScripts.clear()
  }
}

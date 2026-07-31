import type { Component } from './Component.ts'
import type { Entity } from '../core/Entity.ts'

export interface ScriptCallbacks {
  /** Executed once before the first frame update of this script. */
  onStart?: (entity: Entity) => void
  /** Executed every frame during the update phase. */
  onUpdate?: (deltaTime: number, entity: Entity) => void
  /** Executed when the script component or entity is destroyed. */
  onDestroy?: (entity: Entity) => void
}

/**
 * Pure ECS component that attaches user-defined lifecycle callbacks to an entity.
 * Contains no rendering or engine implementation details.
 */
export interface ScriptComponent extends Component {
  readonly type: 'script'
  onStart?: (entity: Entity) => void
  onUpdate?: (deltaTime: number, entity: Entity) => void
  onDestroy?: (entity: Entity) => void
  /** Internal flag tracking whether onStart has executed. */
  started: boolean
}

/**
 * Factory function to create a ScriptComponent.
 */
export function createScript(callbacks: ScriptCallbacks): ScriptComponent {
  return {
    type: 'script',
    onStart: callbacks.onStart,
    onUpdate: callbacks.onUpdate,
    onDestroy: callbacks.onDestroy,
    started: false,
  }
}

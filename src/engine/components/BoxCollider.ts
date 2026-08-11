import type { Component } from './Component.ts'
import type { Vec3 } from './Transform.ts'

/**
 * Pure ECS component. Attaches a box collider to an entity's rigid body.
 * Contains no Rapier types.
 */
export interface BoxColliderComponent extends Component {
  readonly type: 'boxCollider'
  /** Half-extents along each axis in world units. */
  halfExtents: Vec3
}

export interface CreateBoxColliderOptions {
  halfExtents?: Partial<Vec3>
}

/** Create a BoxColliderComponent. Defaults to a unit half-extent (1×1×1 full cube). */
export function createBoxCollider(options: CreateBoxColliderOptions = {}): BoxColliderComponent {
  return {
    type: 'boxCollider',
    halfExtents: {
      x: options.halfExtents?.x ?? 0.5,
      y: options.halfExtents?.y ?? 0.5,
      z: options.halfExtents?.z ?? 0.5,
    },
  }
}

import type { Component } from './Component.ts'

/**
 * Pure ECS component. Attaches a sphere collider to an entity's rigid body.
 * Contains no Rapier types.
 */
export interface SphereColliderComponent extends Component {
  readonly type: 'sphereCollider'
  /** Sphere radius in world units. */
  radius: number
}

export interface CreateSphereColliderOptions {
  radius?: number
}

/** Create a SphereColliderComponent. Defaults to radius 0.5. */
export function createSphereCollider(options: CreateSphereColliderOptions = {}): SphereColliderComponent {
  return {
    type: 'sphereCollider',
    radius: options.radius ?? 0.5,
  }
}

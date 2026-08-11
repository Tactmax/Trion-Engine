import type { Component } from './Component.ts'

/** Whether the body participates in the dynamics simulation or is a fixed obstacle. */
export type RigidBodyType = 'dynamic' | 'fixed'

/**
 * Pure ECS component. Marks an entity as having a physics rigid body.
 * Contains no Rapier types, no backend handles, no Three.js references.
 */
export interface RigidBodyComponent extends Component {
  readonly type: 'rigidBody'
  bodyType: RigidBodyType
}

export interface CreateRigidBodyOptions {
  bodyType?: RigidBodyType
}

/** Create a RigidBodyComponent. Defaults to 'dynamic'. */
export function createRigidBody(options: CreateRigidBodyOptions = {}): RigidBodyComponent {
  return {
    type: 'rigidBody',
    bodyType: options.bodyType ?? 'dynamic',
  }
}

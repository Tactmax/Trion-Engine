/**
 * Opaque handle to a physics rigid body inside the backend.
 * Never expose backend-specific types (Rapier handles, Bullet IDs, etc.)
 * outside this handle type.
 */
export type PhysicsBodyHandle = number & { readonly __brand: 'PhysicsBodyHandle' }

/**
 * Opaque handle to a physics collider inside the backend.
 */
export type PhysicsColliderHandle = number & { readonly __brand: 'PhysicsColliderHandle' }

/** Engine-native 3-component vector. Mirrors Vec3 but kept local so the
 *  physics layer has no dependency on the components package. */
export interface PhysVec3 {
  x: number
  y: number
  z: number
}

/** Rigid body types supported by all backends. */
export type RigidBodyType = 'dynamic' | 'fixed'

/** Description passed to the backend when creating a rigid body. */
export interface RigidBodyDesc {
  type: RigidBodyType
  position: PhysVec3
  /** Euler XYZ rotation in radians — same convention as TransformComponent. */
  rotation: PhysVec3
}

/** Description passed to the backend when attaching a box collider. */
export interface BoxColliderDesc {
  /** Half-extents along each axis. */
  halfExtents: PhysVec3
}

/** Description passed to the backend when attaching a sphere collider. */
export interface SphereColliderDesc {
  radius: number
}

export type ColliderDesc = ({ shape: 'box' } & BoxColliderDesc) | ({ shape: 'sphere' } & SphereColliderDesc)

/**
 * Backend-agnostic physics interface.
 *
 * Rules:
 *  - No Rapier/Bullet/PhysX types may appear here.
 *  - PhysicsSystem depends only on this interface.
 *  - A future backend is implemented by creating a new class that satisfies
 *    this interface — with zero changes to PhysicsSystem.
 */
export interface PhysicsBackend {
  /**
   * Initialize the backend (load WASM, allocate world, etc.).
   * Must resolve before any other method is called.
   */
  initialize(gravity: PhysVec3): Promise<void>

  /** Advance the simulation by exactly `dt` seconds. */
  step(dt: number): void

  /** Current world gravity. */
  getGravity(): PhysVec3

  /** Replace world gravity. */
  setGravity(gravity: PhysVec3): void



  createRigidBody(desc: RigidBodyDesc): PhysicsBodyHandle

  destroyRigidBody(handle: PhysicsBodyHandle): void



  createCollider(bodyHandle: PhysicsBodyHandle, desc: ColliderDesc): PhysicsColliderHandle

  destroyCollider(handle: PhysicsColliderHandle): void



  getRigidBodyTransform(handle: PhysicsBodyHandle): { position: PhysVec3; rotation: PhysVec3 }

  setRigidBodyTransform(handle: PhysicsBodyHandle, position: PhysVec3, rotation: PhysVec3): void



  getLinearVelocity(handle: PhysicsBodyHandle): PhysVec3

  setLinearVelocity(handle: PhysicsBodyHandle, velocity: PhysVec3): void



  /** Release all backend resources. */
  dispose(): void
}

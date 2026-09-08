/**
 * Opaque handle to a physics rigid body inside the backend.
 * Never expose backend-specific types (Rapier handles, Bullet IDs, etc.)
 * outside this handle type.
 */
export type PhysicsBodyHandle = number & { readonly __brand: 'PhysicsBodyHandle' }

export type PhysicsColliderHandle = number & { readonly __brand: 'PhysicsColliderHandle' }

/** Engine-native 3-component vector. Mirrors Vec3 but kept local so the
 *  physics layer has no dependency on the components package. */
export interface PhysVec3 {
  x: number
  y: number
  z: number
}

export type RigidBodyType = 'dynamic' | 'fixed'

export interface RigidBodyDesc {
  type: RigidBodyType
  position: PhysVec3
  /** Euler XYZ rotation in radians — same convention as TransformComponent. */
  rotation: PhysVec3
}

export interface BoxColliderDesc {
  halfExtents: PhysVec3
}

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

  step(dt: number): void

  getGravity(): PhysVec3

  setGravity(gravity: PhysVec3): void



  createRigidBody(desc: RigidBodyDesc): PhysicsBodyHandle

  destroyRigidBody(handle: PhysicsBodyHandle): void



  createCollider(bodyHandle: PhysicsBodyHandle, desc: ColliderDesc): PhysicsColliderHandle

  destroyCollider(handle: PhysicsColliderHandle): void



  getRigidBodyTransform(handle: PhysicsBodyHandle): { position: PhysVec3; rotation: PhysVec3 }

  setRigidBodyTransform(handle: PhysicsBodyHandle, position: PhysVec3, rotation: PhysVec3): void



  getLinearVelocity(handle: PhysicsBodyHandle): PhysVec3

  setLinearVelocity(handle: PhysicsBodyHandle, velocity: PhysVec3): void



  dispose(): void
}

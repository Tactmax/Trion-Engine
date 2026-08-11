/**
 * RapierPhysicsBackend
 *
 * The ONLY file in the engine that imports Rapier.
 * All Rapier types (RigidBody, Collider, World, Vector3, handles, etc.) are
 * confined to this file. Nothing outside leaks them.
 *
 * Implements PhysicsBackend so PhysicsSystem never needs to know about Rapier.
 */
import RAPIER from '@dimforge/rapier3d-compat'
import type {
  PhysicsBackend,
  PhysicsBodyHandle,
  PhysicsColliderHandle,
  ColliderDesc,
  PhysVec3,
  RigidBodyDesc,
} from './PhysicsBackend.ts'

export class RapierPhysicsBackend implements PhysicsBackend {
  // Rapier world — typed as `any` in the public surface; only used internally.
  private world!: RAPIER.World

  // Rapier uses numeric handles internally. We cast them to our branded types.
  private readonly rigidBodies = new Map<PhysicsBodyHandle, RAPIER.RigidBody>()
  private readonly colliders = new Map<PhysicsColliderHandle, RAPIER.Collider>()

  private nextBodyHandle = 0 as PhysicsBodyHandle
  private nextColliderHandle = 0 as PhysicsColliderHandle


  async initialize(gravity: PhysVec3): Promise<void> {
    await RAPIER.init()
    this.world = new RAPIER.World({ x: gravity.x, y: gravity.y, z: gravity.z })
  }

  dispose(): void {
    this.colliders.clear()
    this.rigidBodies.clear()
    this.world.free()
  }


  step(dt: number): void {
    this.world.timestep = dt
    this.world.step()
  }


  getGravity(): PhysVec3 {
    const g = this.world.gravity
    return { x: g.x, y: g.y, z: g.z }
  }

  setGravity(gravity: PhysVec3): void {
    this.world.gravity = { x: gravity.x, y: gravity.y, z: gravity.z }
  }


  createRigidBody(desc: RigidBodyDesc): PhysicsBodyHandle {
    // Build Rapier rigid-body descriptor
    let rapierDesc: RAPIER.RigidBodyDesc
    if (desc.type === 'fixed') {
      rapierDesc = RAPIER.RigidBodyDesc.fixed()
    } else {
      rapierDesc = RAPIER.RigidBodyDesc.dynamic()
    }

    // Apply initial transform
    rapierDesc.setTranslation(desc.position.x, desc.position.y, desc.position.z)

    // Convert Euler XYZ → quaternion for Rapier
    const quat = eulerToQuat(desc.rotation)
    rapierDesc.setRotation(quat)

    const body = this.world.createRigidBody(rapierDesc)

    const handle = this.nextBodyHandle++ as PhysicsBodyHandle
    this.rigidBodies.set(handle, body)
    return handle
  }

  destroyRigidBody(handle: PhysicsBodyHandle): void {
    const body = this.rigidBodies.get(handle)
    if (body) {
      this.world.removeRigidBody(body)
      this.rigidBodies.delete(handle)
    }
  }


  createCollider(bodyHandle: PhysicsBodyHandle, desc: ColliderDesc): PhysicsColliderHandle {
    const body = this.rigidBodies.get(bodyHandle)
    if (!body) throw new Error(`[RapierPhysicsBackend] Unknown body handle: ${bodyHandle}`)

    let rapierColliderDesc: RAPIER.ColliderDesc
    if (desc.shape === 'box') {
      rapierColliderDesc = RAPIER.ColliderDesc.cuboid(
        desc.halfExtents.x,
        desc.halfExtents.y,
        desc.halfExtents.z,
      )
    } else {
      rapierColliderDesc = RAPIER.ColliderDesc.ball(desc.radius)
    }

    const collider = this.world.createCollider(rapierColliderDesc, body)

    const handle = this.nextColliderHandle++ as PhysicsColliderHandle
    this.colliders.set(handle, collider)
    return handle
  }

  destroyCollider(handle: PhysicsColliderHandle): void {
    const collider = this.colliders.get(handle)
    if (collider) {
      this.world.removeCollider(collider, false)
      this.colliders.delete(handle)
    }
  }


  getRigidBodyTransform(handle: PhysicsBodyHandle): { position: PhysVec3; rotation: PhysVec3 } {
    const body = this.rigidBodies.get(handle)
    if (!body) return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }

    const t = body.translation()
    const q = body.rotation()
    return {
      position: { x: t.x, y: t.y, z: t.z },
      rotation: quatToEuler(q),
    }
  }

  setRigidBodyTransform(handle: PhysicsBodyHandle, position: PhysVec3, rotation: PhysVec3): void {
    const body = this.rigidBodies.get(handle)
    if (!body) return

    body.setTranslation({ x: position.x, y: position.y, z: position.z }, true)
    const quat = eulerToQuat(rotation)
    body.setRotation(quat, true)
  }


  getLinearVelocity(handle: PhysicsBodyHandle): PhysVec3 {
    const body = this.rigidBodies.get(handle)
    if (!body) return { x: 0, y: 0, z: 0 }
    const v = body.linvel()
    return { x: v.x, y: v.y, z: v.z }
  }

  setLinearVelocity(handle: PhysicsBodyHandle, velocity: PhysVec3): void {
    const body = this.rigidBodies.get(handle)
    if (!body) return
    body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true)
  }
}


interface Quat { x: number; y: number; z: number; w: number }

/**
 * Convert Euler XYZ angles (radians) to a quaternion.
 * Matches the XYZ intrinsic convention used by Three.js and TransformComponent.
 */
function eulerToQuat(e: PhysVec3): Quat {
  const cx = Math.cos(e.x / 2), sx = Math.sin(e.x / 2)
  const cy = Math.cos(e.y / 2), sy = Math.sin(e.y / 2)
  const cz = Math.cos(e.z / 2), sz = Math.sin(e.z / 2)

  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  }
}

/**
 * Convert a quaternion back to Euler XYZ angles (radians).
 * Inverse of eulerToQuat — returns angles in the same convention.
 */
function quatToEuler(q: Quat): PhysVec3 {
  // Roll (X)
  const sinrCosp = 2 * (q.w * q.x + q.y * q.z)
  const cosrCosp = 1 - 2 * (q.x * q.x + q.y * q.y)
  const rx = Math.atan2(sinrCosp, cosrCosp)

  // Pitch (Y)
  const sinp = 2 * (q.w * q.y - q.z * q.x)
  const ry = Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)

  // Yaw (Z)
  const sinyCosp = 2 * (q.w * q.z + q.x * q.y)
  const cosyCosp = 1 - 2 * (q.y * q.y + q.z * q.z)
  const rz = Math.atan2(sinyCosp, cosyCosp)

  return { x: rx, y: ry, z: rz }
}

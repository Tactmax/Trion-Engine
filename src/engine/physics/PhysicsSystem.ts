import type { Scene } from '../core/Scene.ts'
import type { Entity } from '../core/Entity.ts'
import type { TransformComponent } from '../components/Transform.ts'
import type { RigidBodyComponent } from '../components/RigidBody.ts'
import type { BoxColliderComponent } from '../components/BoxCollider.ts'
import type { SphereColliderComponent } from '../components/SphereCollider.ts'
import type {
  PhysicsBackend,
  PhysicsBodyHandle,
  PhysicsColliderHandle,
  PhysVec3,
} from './PhysicsBackend.ts'

/** Internal record per physics entity. No Rapier types appear here. */
interface PhysicsEntry {
  bodyHandle: PhysicsBodyHandle
  colliderHandle: PhysicsColliderHandle | null
  bodyType: 'dynamic' | 'fixed'
}

/**
 * PhysicsSystem — bridges ECS and any PhysicsBackend implementation.
 *
 * Depends ONLY on the PhysicsBackend interface. Zero Rapier imports.
 *
 * Fixed-timestep accumulator: physics advances in FIXED_STEP increments
 * regardless of the variable render frame rate. The leftover accumulator
 * carries over to the next frame.
 *
 * Frame ordering (in onPostUpdate):
 *   1. physicsSystem.update(dt)
 *      a. Accumulate dt
 *      b. For each fixed tick:
 *         i.  Write fixed-body transforms ECS → backend
 *         ii. backend.step(FIXED_STEP)
 *         iii.Read dynamic-body transforms backend → ECS
 *   2. meshRendererSystem.sync()  (reads updated TransformComponents)
 */
export class PhysicsSystem {
  private readonly scene: Scene
  private backend: PhysicsBackend | null = null

  private readonly entries = new Map<number, PhysicsEntry>()
  private accumulator = 0

  /** Fixed physics timestep in seconds. */
  static readonly FIXED_STEP = 1 / 60

  constructor(scene: Scene) {
    this.scene = scene
  }


  /**
   * Assign (or replace) the physics backend.
   * The backend must already be initialised (await backend.initialize()) before
   * being passed here.
   */
  setBackend(backend: PhysicsBackend): void {
    if (this.backend) {
      this.disposeAllEntries()
      this.backend.dispose()
    }
    this.backend = backend
  }


  getGravity(): PhysVec3 | null {
    return this.backend?.getGravity() ?? null
  }

  setGravity(gravity: PhysVec3): void {
    this.backend?.setGravity(gravity)
  }

  /**
   * Advance the simulation. Call once per frame from engine.onPostUpdate
   * BEFORE MeshRendererSystem.sync() so the renderer sees the latest positions.
   */
  update(deltaTime: number): void {
    if (!this.backend) return

    // Cap dt to avoid spiral-of-death on long frames.
    const capped = Math.min(deltaTime, 0.25)
    this.accumulator += capped

    while (this.accumulator >= PhysicsSystem.FIXED_STEP) {
      this.syncFixedBodiesToBackend()
      this.backend.step(PhysicsSystem.FIXED_STEP)
      this.syncDynamicBodiesToECS()
      this.accumulator -= PhysicsSystem.FIXED_STEP
    }

    this.syncNewEntities()
    this.removeStaleEntries()
  }

  /**
   * Release all backend bodies/colliders and dispose the backend.
   * Call when tearing down the scene.
   */
  dispose(): void {
    if (!this.backend) return
    this.disposeAllEntries()
    this.backend.dispose()
    this.backend = null
  }


  /**
   * Create backend bodies/colliders for entities that have physics components
   * but are not yet tracked by this system.
   */
  private syncNewEntities(): void {
    if (!this.backend) return

    const rigidBodyEntities = this.scene.getEntitiesWithComponent('rigidBody')
    for (const entity of rigidBodyEntities) {
      if (this.entries.has(entity.id)) continue
      this.registerEntity(entity)
    }
  }

  private registerEntity(entity: Entity): void {
    if (!this.backend) return

    const rb = entity.getComponent<RigidBodyComponent>('rigidBody')!
    const xform = entity.getComponent<TransformComponent>('transform')

    const position: PhysVec3 = xform
      ? { x: xform.position.x, y: xform.position.y, z: xform.position.z }
      : { x: 0, y: 0, z: 0 }

    const rotation: PhysVec3 = xform
      ? { x: xform.rotation.x, y: xform.rotation.y, z: xform.rotation.z }
      : { x: 0, y: 0, z: 0 }

    const bodyHandle = this.backend.createRigidBody({
      type: rb.bodyType,
      position,
      rotation,
    })

    let colliderHandle: PhysicsColliderHandle | null = null

    const box = entity.getComponent<BoxColliderComponent>('boxCollider')
    if (box) {
      colliderHandle = this.backend.createCollider(bodyHandle, {
        shape: 'box',
        halfExtents: { x: box.halfExtents.x, y: box.halfExtents.y, z: box.halfExtents.z },
      })
    } else {
      const sphere = entity.getComponent<SphereColliderComponent>('sphereCollider')
      if (sphere) {
        colliderHandle = this.backend.createCollider(bodyHandle, {
          shape: 'sphere',
          radius: sphere.radius,
        })
      }
    }

    this.entries.set(entity.id, {
      bodyHandle,
      colliderHandle,
      bodyType: rb.bodyType,
    })
  }


  /**
   * For fixed/static bodies: write their current ECS transform into the backend
   * so scripts can move kinematic obstacles by mutating TransformComponent.
   * Dynamic bodies are NEVER written here — that would override physics.
   */
  private syncFixedBodiesToBackend(): void {
    if (!this.backend) return

    for (const [entityId, entry] of this.entries) {
      if (entry.bodyType !== 'fixed') continue

      const entity = this.scene.getEntity(entityId)
      const xform = entity?.getComponent<TransformComponent>('transform')
      if (!xform) continue

      this.backend.setRigidBodyTransform(
        entry.bodyHandle,
        { x: xform.position.x, y: xform.position.y, z: xform.position.z },
        { x: xform.rotation.x, y: xform.rotation.y, z: xform.rotation.z },
      )
    }
  }

  /**
   * For dynamic bodies: read the backend transform and write it back to
   * TransformComponent so MeshRendererSystem picks it up this frame.
   */
  private syncDynamicBodiesToECS(): void {
    if (!this.backend) return

    for (const [entityId, entry] of this.entries) {
      if (entry.bodyType !== 'dynamic') continue

      const entity = this.scene.getEntity(entityId)
      const xform = entity?.getComponent<TransformComponent>('transform')
      if (!xform) continue

      const { position, rotation } = this.backend.getRigidBodyTransform(entry.bodyHandle)
      xform.position.x = position.x
      xform.position.y = position.y
      xform.position.z = position.z
      xform.rotation.x = rotation.x
      xform.rotation.y = rotation.y
      xform.rotation.z = rotation.z
    }
  }


  /**
   * Detect tracked entities that were destroyed or had their rigidBody
   * component removed, and clean up the corresponding backend objects.
   */
  private removeStaleEntries(): void {
    if (!this.backend) return

    const staleIds: number[] = []
    for (const entityId of this.entries.keys()) {
      const entity = this.scene.getEntity(entityId)
      if (!entity || !entity.hasComponent('rigidBody')) {
        staleIds.push(entityId)
      }
    }

    for (const id of staleIds) {
      this.destroyEntry(id)
    }
  }

  private destroyEntry(entityId: number): void {
    if (!this.backend) return

    const entry = this.entries.get(entityId)
    if (!entry) return

    if (entry.colliderHandle !== null) {
      this.backend.destroyCollider(entry.colliderHandle)
    }
    this.backend.destroyRigidBody(entry.bodyHandle)
    this.entries.delete(entityId)
  }

  private disposeAllEntries(): void {
    for (const entityId of this.entries.keys()) {
      this.destroyEntry(entityId)
    }
    this.entries.clear()
  }
}

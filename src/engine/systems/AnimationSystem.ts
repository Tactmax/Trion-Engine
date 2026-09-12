import * as THREE from 'three'
import { trionLogger } from '../core/Logger.ts'
import type { Scene } from '../core/Scene.ts'
import type { Entity } from '../core/Entity.ts'
import type { AnimationComponent } from '../components/Animation.ts'
import type { TransformComponent } from '../components/Transform.ts'
import type { AssetManager } from '../graphics/AssetManager.ts'
import type { MeshRendererSystem } from '../graphics/MeshRendererSystem.ts'
import type { Renderer } from '../graphics/Renderer.ts'
import { getWorldTransform } from '../components/Hierarchy.ts'

interface AnimationEntry {
  mixer: THREE.AnimationMixer
  target: THREE.Object3D
  mesh?: THREE.Mesh
  component: AnimationComponent
  action?: THREE.AnimationAction
  activeClipId?: string
  assetId: string
}

export class AnimationSystem {
  private readonly scene: Scene
  private readonly assets: AssetManager
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly renderer: Renderer
  private readonly mixers = new Map<number, AnimationEntry>()
  private readonly warned = new Set<string>()

  constructor(scene: Scene, assets: AssetManager, meshRendererSystem: MeshRendererSystem, renderer: Renderer) {
    this.scene = scene
    this.assets = assets
    this.meshRendererSystem = meshRendererSystem
    this.renderer = renderer
  }

  getTarget(entityId: number): THREE.Object3D | undefined {
    return this.mixers.get(entityId)?.target
  }

  /**
   * Drop every runtime mixer/target without touching ECS state. Call when the
   * scene is replaced or Play Mode ends so no stale animation state survives;
   * the next update() rebuilds entries from current components.
   */
  clear(): void {
    for (const entityId of [...this.mixers.keys()]) {
      this.removeEntry(entityId)
    }
  }

  /**
   * Reset one entity's playback to the bind pose and mixer time zero.
   * The entry is discarded and rebuilt on demand, so no Three.js action
   * time semantics leak into the reset. Editor preview Stop uses this.
   */
  resetPlayback(entityId: number): void {
    if (!this.mixers.has(entityId)) return
    this.removeEntry(entityId, { keepMesh: true })
    this.update(0)
  }

  update(deltaTime: number): void {
    const activeEntityIds = new Set<number>()
    const entities = this.scene.getEntitiesWithComponent('animation')

    for (const entity of entities) {
      const component = entity.getComponent<AnimationComponent>('animation')
      if (!component) continue

      activeEntityIds.add(entity.id)
      const entry = this.ensureMixer(entity, component)
      if (!entry) continue

      this.syncTransform(entry, entity)

      if (!component.playing || !component.activeClip) {
        // Paused with a clip: freeze the current pose by keeping the action
        // alive and simply not advancing mixer time. Stopping the action
        // would snap animated nodes back to the bind pose, which is Stop's
        // job (see resetPlayback), not Pause's.
        const paused = !component.playing && component.activeClip !== undefined
        if (!paused && entry.action) {
          entry.action.stop()
          entry.action = undefined
        }
        continue
      }

      const clip = this.assets.getAnimation(component.activeClip)
      if (!clip) {
        this.warnOnce(`clip:${entity.id}:${component.activeClip}`, `Animation clip not found: "${component.activeClip}" (entity ${entity.id})`)
        continue
      }
      this.warned.delete(`clip:${entity.id}:${component.activeClip}`)

      this.syncAction(entry, component, clip)
      entry.mixer.update(deltaTime * resolveSpeed(component))
    }

    for (const [entityId] of this.mixers.entries()) {
      if (!activeEntityIds.has(entityId)) {
        this.removeEntry(entityId)
      }
    }
  }

  private ensureMixer(entity: Entity, component: AnimationComponent): AnimationEntry | undefined {
    const existing = this.mixers.get(entity.id)
    if (existing) {
      if (existing.assetId === (component.assetId ?? '')) {
        existing.component = component
        return existing
      }
      // The entity now references a different asset (scene switch, undo/redo):
      // discard the stale mixer/target instead of reusing it.
      this.removeEntry(entity.id)
    }

    if (!component.assetId) {
      this.warnOnce(`asset:${entity.id}`, `Failed to initialize animation: entity ${entity.id} is missing an animation asset reference`)
      return undefined
    }

    const target = this.resolveTarget(component)
    if (!target) {
      this.warnOnce(`root:${entity.id}:${component.assetId}`, `Failed to initialize animation: missing animation root for asset "${component.assetId}"`)
      return undefined
    }

    const mesh = this.resolveMesh(entity)
    if (mesh) {
      // The mesh is now a child of the animation root, so its local
      // transform should be identity — world-space position comes from
      // the parent target (synced in syncTransform below).
      mesh.position.set(0, 0, 0)
      mesh.rotation.set(0, 0, 0)
      mesh.scale.set(1, 1, 1)
      target.add(mesh)
    }

    this.renderer.add(target)

    const mixer = new THREE.AnimationMixer(target)
    const entry: AnimationEntry = { mixer, target, mesh, component, activeClipId: undefined, assetId: component.assetId ?? '' }
    this.mixers.set(entity.id, entry)
    this.syncTransform(entry, entity)
    return entry
  }

  private syncAction(entry: AnimationEntry, component: AnimationComponent, clip: THREE.AnimationClip): void {
    const needsNewAction = !entry.action || entry.activeClipId !== component.activeClip

    if (needsNewAction) {
      entry.action?.stop()
      entry.action = entry.mixer.clipAction(clip)
      entry.action.setLoop(component.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      entry.action.play()
      entry.activeClipId = component.activeClip
    }

    // playing is guaranteed true here — the caller already guards on this
    if (entry.action && entry.component.loop !== component.loop) {
      entry.action.setLoop(component.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    }

    entry.component = component
  }

  private resolveTarget(component: AnimationComponent): THREE.Object3D | undefined {
    const assetRoot = this.assets.getAnimationRoot(component.assetId ?? '')
    if (!assetRoot) return undefined

    const target = assetRoot.clone(true)
    target.position.set(0, 0, 0)
    target.rotation.set(0, 0, 0)
    target.scale.set(1, 1, 1)
    return target
  }

  private syncTransform(entry: AnimationEntry, entity: Entity): void {
    const transform = entity.getComponent<TransformComponent>('transform')
    if (!transform) return

    const world = getWorldTransform(this.scene, entity.id)
    entry.target.position.set(world.position.x, world.position.y, world.position.z)
    entry.target.rotation.set(world.rotation.x, world.rotation.y, world.rotation.z)
    entry.target.scale.set(world.scale.x, world.scale.y, world.scale.z)
  }

  private resolveMesh(entity: Entity): THREE.Mesh | undefined {
    const mesh = this.meshRendererSystem.ensureMesh(entity.id)
    return mesh ?? undefined
  }

  private removeEntry(entityId: number, options: { keepMesh?: boolean } = {}): void {
    const entry = this.mixers.get(entityId)
    if (!entry) return
    entry.action?.stop()
    this.renderer.remove(entry.target)
    if (!options.keepMesh && entry.mesh) {
      entry.target.remove(entry.mesh)
      this.renderer.removeMesh(entityId)
    }
    this.mixers.delete(entityId)
    for (const key of [...this.warned]) {
      if (key === `asset:${entityId}` || key.startsWith(`clip:${entityId}:`) || key.startsWith(`root:${entityId}:`)) {
        this.warned.delete(key)
      }
    }
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return
    this.warned.add(key)
    trionLogger.warn(message, { source: 'Animation' })
  }
}

function resolveSpeed(component: AnimationComponent): number {
  const speed = component.speed
  return typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : 1
}

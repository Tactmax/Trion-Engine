import * as THREE from 'three'
import type { Scene } from '../core/Scene.ts'
import type { Entity } from '../core/Entity.ts'
import type { AnimationComponent } from '../components/Animation.ts'
import type { TransformComponent } from '../components/Transform.ts'
import type { AssetManager } from '../graphics/AssetManager.ts'
import type { MeshRendererSystem } from '../graphics/MeshRendererSystem.ts'
import type { Renderer } from '../graphics/Renderer.ts'

interface AnimationEntry {
  mixer: THREE.AnimationMixer
  target: THREE.Object3D
  mesh?: THREE.Mesh
  component: AnimationComponent
  action?: THREE.AnimationAction
  activeClipId?: string
}

export class AnimationSystem {
  private readonly scene: Scene
  private readonly assets: AssetManager
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly renderer: Renderer
  private readonly mixers = new Map<number, AnimationEntry>()

  constructor(scene: Scene, assets: AssetManager, meshRendererSystem: MeshRendererSystem, renderer: Renderer) {
    this.scene = scene
    this.assets = assets
    this.meshRendererSystem = meshRendererSystem
    this.renderer = renderer
  }

  /** Return the animated entity's scene target, if one is active. */
  getTarget(entityId: number): THREE.Object3D | undefined {
    return this.mixers.get(entityId)?.target
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
        if (entry.action) {
          entry.action.stop()
          entry.action = undefined
        }
        continue
      }

      const clip = this.assets.getAnimation(component.activeClip)
      if (!clip) {
        console.warn(`[AnimationSystem] Missing animation clip "${component.activeClip}" for entity ${entity.id}`)
        continue
      }

      this.syncAction(entry, component, clip)
      entry.mixer.update(deltaTime)
    }

    for (const [entityId, entry] of this.mixers.entries()) {
      if (!activeEntityIds.has(entityId)) {
        entry.action?.stop()
        this.renderer.remove(entry.target)
        if (entry.mesh) {
          entry.target.remove(entry.mesh)
          this.renderer.removeMesh(entityId)
        }
        this.mixers.delete(entityId)
      }
    }
  }

  private ensureMixer(entity: Entity, component: AnimationComponent): AnimationEntry | undefined {
    const existing = this.mixers.get(entity.id)
    if (existing) {
      existing.component = component
      return existing
    }

    if (!component.assetId) {
      console.warn(`[AnimationSystem] Entity ${entity.id} is missing an animation asset reference`)
      return undefined
    }

    const target = this.resolveTarget(component)
    if (!target) {
      console.warn(`[AnimationSystem] Missing animation root for asset "${component.assetId}"`)
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
    const entry: AnimationEntry = { mixer, target, mesh, component, activeClipId: undefined }
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

    entry.target.position.set(transform.position.x, transform.position.y, transform.position.z)
    entry.target.rotation.set(transform.rotation.x, transform.rotation.y, transform.rotation.z)
    entry.target.scale.set(transform.scale.x, transform.scale.y, transform.scale.z)
  }

  private resolveMesh(entity: Entity): THREE.Mesh | undefined {
    const mesh = this.meshRendererSystem.ensureMesh(entity.id)
    return mesh ?? undefined
  }
}

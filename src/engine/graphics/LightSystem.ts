import * as THREE from 'three'
import type { Scene } from '../core/Scene.ts'
import type {
  DirectionalLightComponent,
  LightComponentType,
  PointLightComponent,
  SpotLightComponent,
} from '../components/Light.ts'
import type { Renderer } from './Renderer.ts'
import { getWorldTransform } from '../components/Hierarchy.ts'

interface LightEntry {
  light: THREE.Light
  target: THREE.Object3D | null
  lightType: LightComponentType
}

const LIGHT_TYPES: readonly LightComponentType[] = ['directionalLight', 'pointLight', 'spotLight']

/**
 * Three.js (r155+) interprets point/spot intensity as candela with physical
 * inverse-square decay, so a user-facing intensity of 1 would be a faint
 * candle next to the unit-less directional intensity (visible ~0.1 at 3m
 * against the demo's ambient 0.8 + directional 1.4). Scale it so the
 * Inspector value behaves like a brightness knob at typical scene distances.
 */
const POINT_SPOT_INTENSITY_SCALE = 10

function normalizeColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#ffffff'
}

function normalizeNonNegative(value: unknown, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) && num >= 0 ? num : fallback
}

/**
 * Bridges ECS light components and the Three.js scene.
 *
 * Owns one THREE.Light per light entity (plus a target object for
 * directional/spot lights) and mirrors component data + Transform every
 * sync. Stale lights are removed when their entity or component disappears.
 * Lights authored here are additive: any lights added directly to the
 * Renderer outside the ECS (e.g. demo defaults) are left untouched.
 *
 * Call sync() once per frame alongside MeshRendererSystem.sync().
 */
export class LightSystem {
  private readonly scene: Scene
  private readonly renderer: Renderer
  private readonly cache = new Map<number, LightEntry>()

  constructor(scene: Scene, renderer: Renderer) {
    this.scene = scene
    this.renderer = renderer
  }

  sync(): void {
    const seen = new Set<number>()
    for (const lightType of LIGHT_TYPES) {
      for (const entity of this.scene.getEntitiesWithComponent(lightType)) {
        seen.add(entity.id)
        this.syncEntity(entity.id, lightType)
      }
    }
    for (const entityId of [...this.cache.keys()]) {
      if (!seen.has(entityId)) this.removeEntry(entityId)
    }
  }

  /** Number of managed runtime lights (headless-test hook). */
  managedCount(): number {
    return this.cache.size
  }

  /**
   * Borrow the runtime light for an entity. The entry stays owned by this
   * system — callers must not dispose, remove or reparent it. Returns
   * undefined when the entity currently has no synced light (e.g. its
   * component was just added and sync() has not run yet).
   */
  getLight(entityId: number): THREE.Light | undefined {
    return this.cache.get(entityId)?.light
  }

  clear(): void {
    for (const entityId of [...this.cache.keys()]) this.removeEntry(entityId)
  }

  private syncEntity(entityId: number, lightType: LightComponentType): void {
    const entity = this.scene.getEntity(entityId)
    if (!entity) {
      this.removeEntry(entityId)
      return
    }
    const existing = this.cache.get(entityId)
    if (!existing || existing.lightType !== lightType) {
      if (existing) this.removeEntry(entityId)
      const created = this.createEntry(lightType)
      if (!created) return
      this.cache.set(entityId, created)
    }
    const entry = this.cache.get(entityId)
    if (!entry) return
    const world = getWorldTransform(this.scene, entityId)
    const px = world.position.x
    const py = world.position.y
    const pz = world.position.z
    const rx = world.rotation.x
    const ry = world.rotation.y
    const rz = world.rotation.z

    if (entry.lightType === 'directionalLight') {
      const comp = entity.getComponent<DirectionalLightComponent>('directionalLight')
      if (!comp) return
      const light = entry.light as THREE.DirectionalLight
      light.color.set(normalizeColor(comp.color))
      light.intensity = normalizeNonNegative(comp.intensity, 1)
      light.position.set(px, py, pz)
      // Mirror the ECS orientation onto the light object itself. Three.js
      // aims the light via position/target only, so this changes nothing
      // visually — it lets editor gizmos rotate from the true direction.
      light.quaternion.setFromEuler(new THREE.Euler(rx, ry, rz))
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(rx, ry, rz))
      if (entry.target) {
        entry.target.position.set(px + dir.x, py + dir.y, pz + dir.z)
        entry.target.updateMatrixWorld()
      }
    } else if (entry.lightType === 'pointLight') {
      const comp = entity.getComponent<PointLightComponent>('pointLight')
      if (!comp) return
      const light = entry.light as THREE.PointLight
      light.color.set(normalizeColor(comp.color))
      light.intensity = normalizeNonNegative(comp.intensity, 1) * POINT_SPOT_INTENSITY_SCALE
      light.distance = normalizeNonNegative(comp.distance, 0)
      light.position.set(px, py, pz)
    } else {
      const comp = entity.getComponent<SpotLightComponent>('spotLight')
      if (!comp) return
      const light = entry.light as THREE.SpotLight
      light.color.set(normalizeColor(comp.color))
      light.intensity = normalizeNonNegative(comp.intensity, 1) * POINT_SPOT_INTENSITY_SCALE
      light.distance = normalizeNonNegative(comp.distance, 0)
      const angle = typeof comp.angle === 'number' && Number.isFinite(comp.angle) ? comp.angle : Math.PI / 6
      light.angle = Math.min(Math.PI / 2 - 0.01, Math.max(0.05, angle))
      const penumbra = typeof comp.penumbra === 'number' && Number.isFinite(comp.penumbra) ? comp.penumbra : 0
      light.penumbra = Math.min(1, Math.max(0, penumbra))
      light.position.set(px, py, pz)
      // Same orientation mirror as directional lights (see above).
      light.quaternion.setFromEuler(new THREE.Euler(rx, ry, rz))
      const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(rx, ry, rz))
      if (entry.target) {
        entry.target.position.set(px + dir.x * 3, py + dir.y * 3, pz + dir.z * 3)
        entry.target.updateMatrixWorld()
      }
    }
  }

  private createEntry(lightType: LightComponentType): LightEntry | null {
    if (lightType === 'directionalLight') {
      const light = new THREE.DirectionalLight(0xffffff, 1)
      const target = new THREE.Object3D()
      light.target = target
      this.renderer.add(light)
      this.renderer.add(target)
      return { light, target, lightType }
    }
    if (lightType === 'pointLight') {
      const light = new THREE.PointLight(0xffffff, 1, 0, 2)
      this.renderer.add(light)
      return { light, target: null, lightType }
    }
    if (lightType === 'spotLight') {
      const light = new THREE.SpotLight(0xffffff, 1, 0, Math.PI / 6, 0, 2)
      const target = new THREE.Object3D()
      light.target = target
      this.renderer.add(light)
      this.renderer.add(target)
      return { light, target, lightType }
    }
    return null
  }

  private removeEntry(entityId: number): void {
    const entry = this.cache.get(entityId)
    if (!entry) return
    this.cache.delete(entityId)
    if (entry.target) this.renderer.remove(entry.target)
    this.renderer.remove(entry.light)
    entry.light.dispose()
  }
}

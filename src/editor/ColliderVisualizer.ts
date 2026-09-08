import * as THREE from 'three'
import type { Scene } from '../engine/core/Scene.ts'
import type { BoxColliderComponent } from '../engine/components/BoxCollider.ts'
import type { SphereColliderComponent } from '../engine/components/SphereCollider.ts'
import { getWorldTransform } from '../engine/components/Hierarchy.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'

/**
 * Editor-only wireframe visualization for physics colliders.
 *
 * Reads ECS collider + transform components and draws matching wireframe
 * shapes directly into the Three.js scene via Renderer. It never touches ECS
 * data, never creates meshes for game rendering, and never writes transforms:
 * the ECS TransformComponent remains the single source of truth and the
 * visualizer only mirrors it.
 *
 * Sizing matches the physics simulation exactly:
 * - Box: full extents = halfExtents * 2 (entity scale is ignored, like PhysicsSystem).
 * - Sphere: radius as-is (entity scale is ignored, like PhysicsSystem).
 *
 * Helpers disable raycasting so viewport picking and TransformControls are
 * unaffected. The whole group is hidden during Play Mode so colliders never
 * appear as part of normal game rendering.
 */
export class ColliderVisualizer {
  private readonly renderer: Renderer
  private readonly getScene: () => Scene
  private readonly group = new THREE.Group()
  private readonly helpers = new Map<string, THREE.LineSegments>()

  private readonly boxGeometry: THREE.EdgesGeometry
  private readonly sphereGeometry: THREE.WireframeGeometry
  private readonly boxMaterial: THREE.LineBasicMaterial
  private readonly sphereMaterial: THREE.LineBasicMaterial

  private visible = true

  constructor(renderer: Renderer, getScene: () => Scene) {
    this.renderer = renderer
    this.getScene = getScene

    this.group.name = 'TrionColliderVisualizer'
    // Never block picking or gizmo interaction.
    this.group.raycast = () => {}

    this.boxGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1))
    this.sphereGeometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 20, 14))
    this.boxMaterial = new THREE.LineBasicMaterial({ color: 0x4ade80 })
    this.sphereMaterial = new THREE.LineBasicMaterial({ color: 0x22d3ee })

    this.renderer.add(this.group)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.group.visible = visible
  }

  isVisible(): boolean {
    return this.visible
  }

  /** Rebuild/resize helpers from current ECS state. Call once per frame in edit mode. */
  update(): void {
    if (!this.visible) return

    const scene = this.getScene()
    const seen = new Set<string>()

    for (const entity of scene.getAllEntities()) {
      const world = getWorldTransform(scene, entity.id)
      const position = world.position
      const rotation = world.rotation

      const box = entity.getComponent<BoxColliderComponent>('boxCollider')
      if (box) {
        const key = `${entity.id}:box`
        seen.add(key)
        const helper = this.ensureHelper(key, 'box')
        const hx = Number(box.halfExtents?.x)
        const hy = Number(box.halfExtents?.y)
        const hz = Number(box.halfExtents?.z)
        if (Number.isFinite(hx) && Number.isFinite(hy) && Number.isFinite(hz) && hx > 0 && hy > 0 && hz > 0) {
          helper.visible = true
          helper.scale.set(hx * 2, hy * 2, hz * 2)
          helper.position.set(position.x, position.y, position.z)
          helper.rotation.set(rotation.x, rotation.y, rotation.z)
        } else {
          helper.visible = false
        }
      }

      const sphere = entity.getComponent<SphereColliderComponent>('sphereCollider')
      if (sphere) {
        const key = `${entity.id}:sphere`
        seen.add(key)
        const helper = this.ensureHelper(key, 'sphere')
        const radius = Number(sphere.radius)
        if (Number.isFinite(radius) && radius > 0) {
          helper.visible = true
          helper.scale.setScalar(radius)
          helper.position.set(position.x, position.y, position.z)
          // Sphere rotation is irrelevant but kept in sync for consistency.
          helper.rotation.set(rotation.x, rotation.y, rotation.z)
        } else {
          helper.visible = false
        }
      }
    }

    for (const [key, helper] of this.helpers) {
      if (!seen.has(key)) {
        this.group.remove(helper)
        this.helpers.delete(key)
      }
    }
  }

  private ensureHelper(key: string, shape: 'box' | 'sphere'): THREE.LineSegments {
    const existing = this.helpers.get(key)
    if (existing) {
      const expectedGeometry = shape === 'box' ? this.boxGeometry : this.sphereGeometry
      if (existing.geometry === expectedGeometry) return existing
      this.group.remove(existing)
      this.helpers.delete(key)
    }
    const helper = new THREE.LineSegments(
      shape === 'box' ? this.boxGeometry : this.sphereGeometry,
      shape === 'box' ? this.boxMaterial : this.sphereMaterial,
    )
    helper.name = `TrionColliderHelper:${key}`
    helper.raycast = () => {}
    this.group.add(helper)
    this.helpers.set(key, helper)
    return helper
  }

  dispose(): void {
    this.group.clear()
    this.helpers.clear()
    this.renderer.remove(this.group)
    this.boxGeometry.dispose()
    this.sphereGeometry.dispose()
    this.boxMaterial.dispose()
    this.sphereMaterial.dispose()
  }
}

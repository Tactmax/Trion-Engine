import * as THREE from 'three'
import type { Scene } from '../engine/core/Scene.ts'
import type { Vec3 } from '../engine/components/Transform.ts'
import { getWorldTransform } from '../engine/components/Hierarchy.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'

const HELPER_COLOR = 0x66ccff
const DIRECTION_LENGTH = 1.2

function disablePicking(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.raycast = () => {}
  })
  object.raycast = () => {}
}

function directionOf(component: Record<string, unknown>): THREE.Vector3 {
  const raw = component.direction as Partial<Vec3> | undefined
  const dir = new THREE.Vector3(
    typeof raw?.x === 'number' && Number.isFinite(raw.x) ? raw.x : 0,
    typeof raw?.y === 'number' && Number.isFinite(raw.y) ? raw.y : 1,
    typeof raw?.z === 'number' && Number.isFinite(raw.z) ? raw.z : 0,
  )
  if (dir.lengthSq() < 1e-8) dir.set(0, 1, 0)
  return dir.normalize()
}

/**
 * Editor-only visualization for ECS particle components.
 *
 * Mirrors particle Transforms with emission-shape helpers (wireframe sphere
 * or box, point marker) plus a direction arrow drawn directly into the
 * Three.js scene via Renderer. Helpers are never ECS entities, disable
 * raycasting so picking and TransformControls are unaffected, and the whole
 * group hides in Play Mode so helpers never appear in game rendering.
 */
export class ParticleVisualizer {
  private readonly renderer: Renderer
  private readonly getScene: () => Scene
  private isHidden?: (entityId: number) => boolean
  private readonly group = new THREE.Group()
  private readonly helpers = new Map<string, THREE.Object3D>()
  private visible = true

  private readonly markerGeometry = new THREE.SphereGeometry(0.06, 12, 8)
  private readonly unitSphereGeometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 12))
  private readonly unitBoxGeometry = new THREE.WireframeGeometry(new THREE.BoxGeometry(1, 1, 1))

  constructor(renderer: Renderer, getScene: () => Scene) {
    this.renderer = renderer
    this.getScene = getScene
    this.group.name = 'TrionParticleVisualizer'
    this.group.raycast = () => {}
    this.renderer.add(this.group)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.group.visible = visible
  }

  setHiddenFilter(filter?: (entityId: number) => boolean): void {
    this.isHidden = filter
  }

  isVisible(): boolean {
    return this.visible
  }

  /** Rebuild helpers from current ECS state. Call once per frame in edit mode. */
  update(): void {
    if (!this.visible) return
    const scene = this.getScene()
    const seen = new Set<string>()

    for (const entity of scene.getAllEntities()) {
      const component = entity.getComponent('particle') as Record<string, unknown> | undefined
      if (!component) continue
      if (this.isHidden?.(entity.id)) continue

      const key = `${entity.id}:particle`
      seen.add(key)
      const world = getWorldTransform(scene, entity.id)
      const helper = this.ensureHelper(key)
      helper.position.set(world.position.x, world.position.y, world.position.z)
      helper.visible = true

      const marker = helper.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
      const shapeMesh = helper.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.LineBasicMaterial>
      const arrow = helper.children[2] as THREE.ArrowHelper
      const playing = component.playing === true
      const tint = playing ? HELPER_COLOR : 0x8899aa
      marker.material.color.set(tint)
      shapeMesh.material.color.set(tint)
      arrow.setColor(new THREE.Color(tint))

      const shape = component.shape === 'box' ? 'box' : component.shape === 'point' ? 'point' : 'sphere'
      if (shape === 'box') {
        if (shapeMesh.geometry !== this.unitBoxGeometry) shapeMesh.geometry = this.unitBoxGeometry
        const extents = component.shapeExtents as Partial<Vec3> | undefined
        const ex = typeof extents?.x === 'number' && Number.isFinite(extents.x) ? Math.max(extents.x, 0.001) : 0.5
        const ey = typeof extents?.y === 'number' && Number.isFinite(extents.y) ? Math.max(extents.y, 0.001) : 0.5
        const ez = typeof extents?.z === 'number' && Number.isFinite(extents.z) ? Math.max(extents.z, 0.001) : 0.5
        shapeMesh.scale.set(ex * 2, ey * 2, ez * 2)
        shapeMesh.visible = true
      } else if (shape === 'sphere') {
        if (shapeMesh.geometry !== this.unitSphereGeometry) shapeMesh.geometry = this.unitSphereGeometry
        const radius = typeof component.shapeRadius === 'number' && Number.isFinite(component.shapeRadius)
          ? Math.max(component.shapeRadius, 0.001)
          : 0.25
        shapeMesh.scale.setScalar(radius)
        shapeMesh.visible = true
      } else {
        shapeMesh.visible = false
      }

      // ArrowHelper orients +Y along the direction and keeps its origin, so
      // reset the position before applying the emitter-rotated direction.
      const local = directionOf(component)
      const euler = new THREE.Euler(world.rotation.x, world.rotation.y, world.rotation.z)
      const dir = local.applyEuler(euler).normalize()
      arrow.position.set(0, 0, 0)
      arrow.setDirection(dir)
      arrow.setLength(DIRECTION_LENGTH, 0.25, 0.14)
    }

    for (const [key, helper] of this.helpers) {
      if (!seen.has(key)) {
        this.group.remove(helper)
        this.helpers.delete(key)
      }
    }
  }

  private ensureHelper(key: string): THREE.Object3D {
    const existing = this.helpers.get(key)
    if (existing) return existing
    const helper = new THREE.Group()
    const marker = new THREE.Mesh(
      this.markerGeometry,
      new THREE.MeshBasicMaterial({ color: HELPER_COLOR, depthTest: false, transparent: true, opacity: 0.95 }),
    )
    const shapeMesh = new THREE.Mesh(
      this.unitSphereGeometry,
      new THREE.LineBasicMaterial({ color: HELPER_COLOR, transparent: true, opacity: 0.5, depthTest: false }),
    )
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), DIRECTION_LENGTH, HELPER_COLOR, 0.25, 0.14)
    helper.add(marker, shapeMesh, arrow)
    helper.name = `TrionParticleHelper:${key}`
    disablePicking(helper)
    this.group.add(helper)
    this.helpers.set(key, helper)
    return helper
  }

  dispose(): void {
    this.group.clear()
    this.helpers.clear()
    this.renderer.remove(this.group)
    this.markerGeometry.dispose()
    this.unitSphereGeometry.dispose()
    this.unitBoxGeometry.dispose()
  }
}

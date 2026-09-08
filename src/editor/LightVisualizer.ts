import * as THREE from 'three'
import type { Scene } from '../engine/core/Scene.ts'
import type { Vec3 } from '../engine/components/Transform.ts'
import type { SpotLightComponent } from '../engine/components/Light.ts'
import { getWorldTransform } from '../engine/components/Hierarchy.ts'
import type { Renderer } from '../engine/graphics/Renderer.ts'

const DIRECTIONAL_LENGTH = 1.5
const MARKER_RADIUS = 0.12

function disablePicking(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.raycast = () => {}
  })
  object.raycast = () => {}
}

function forwardOf(rotation: Vec3 | undefined): THREE.Vector3 {
  const rx = rotation?.x ?? 0
  const ry = rotation?.y ?? 0
  const rz = rotation?.z ?? 0
  return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(rx, ry, rz))
}

/**
 * Editor-only visualization for ECS light components.
 *
 * Mirrors light Transforms with arrow/marker/cone helpers drawn directly
 * into the Three.js scene via Renderer. Helpers are never ECS entities,
 * disable raycasting so picking and TransformControls are unaffected, and
 * the whole group hides in Play Mode so helpers never appear in game rendering.
 */
export class LightVisualizer {
  private readonly renderer: Renderer
  private readonly getScene: () => Scene
  private readonly group = new THREE.Group()
  private readonly helpers = new Map<string, THREE.Object3D>()
  private visible = true

  private readonly markerGeometry = new THREE.SphereGeometry(MARKER_RADIUS, 16, 12)
  private readonly rangeGeometry = new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 20, 14))
  private readonly coneGeometry = new THREE.ConeGeometry(1, 1, 24, 1, true)

  constructor(renderer: Renderer, getScene: () => Scene) {
    this.renderer = renderer
    this.getScene = getScene
    this.group.name = 'TrionLightVisualizer'
    this.group.raycast = () => {}
    this.renderer.add(this.group)
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.group.visible = visible
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
      const world = getWorldTransform(scene, entity.id)
      const px = world.position.x
      const py = world.position.y
      const pz = world.position.z

      if (entity.hasComponent('directionalLight')) {
        const key = `${entity.id}:directionalLight`
        seen.add(key)
        const color = this.lightColor(entity.getComponent('directionalLight') as { color?: unknown })
        const helper = this.ensureHelper(key, 'directional')
        const dir = forwardOf(world.rotation)
        const arrow = helper as THREE.ArrowHelper
        arrow.position.set(px, py, pz)
        arrow.setDirection(dir)
        arrow.setColor(new THREE.Color(color))
        helper.visible = true
      }

      if (entity.hasComponent('pointLight')) {
        const key = `${entity.id}:pointLight`
        seen.add(key)
        const comp = entity.getComponent('pointLight') as { color?: unknown; distance?: unknown }
        const helper = this.ensureHelper(key, 'point')
        helper.position.set(px, py, pz)
        const marker = helper.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
        marker.material.color.set(this.lightColor(comp))
        const range = helper.children[1] as THREE.LineSegments
        const distance = typeof comp?.distance === 'number' && Number.isFinite(comp.distance) ? comp.distance : 0
        range.visible = distance > 0
        if (distance > 0) range.scale.setScalar(Math.max(distance, 0.001))
        helper.visible = true
      }

      if (entity.hasComponent('spotLight')) {
        const key = `${entity.id}:spotLight`
        seen.add(key)
        const comp = entity.getComponent('spotLight') as SpotLightComponent | undefined
        const helper = this.ensureHelper(key, 'spot')
        const dir = forwardOf(world.rotation)
        const distance = typeof comp?.distance === 'number' && Number.isFinite(comp.distance) && (comp.distance as number) > 0
          ? (comp.distance as number)
          : 3
        const angle = typeof comp?.angle === 'number' && Number.isFinite(comp.angle)
          ? Math.min(Math.PI / 2 - 0.02, Math.max(0.05, comp.angle as number))
          : Math.PI / 6
        const length = Math.min(distance, 6)
        const radius = Math.max(Math.tan(angle) * length, 0.02)
        const marker = helper.children[0] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
        marker.material.color.set(this.lightColor(comp))
        marker.position.set(0, 0, 0)
        const cone = helper.children[1] as THREE.Mesh
        cone.scale.set(radius, length, radius)
        cone.position.copy(dir.clone().multiplyScalar(length / 2))
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize())
        const coneMat = cone.material as THREE.MeshBasicMaterial
        coneMat.color.set(this.lightColor(comp))
        helper.position.set(px, py, pz)
        helper.visible = true
      }
    }

    for (const [key, helper] of this.helpers) {
      if (!seen.has(key)) {
        this.group.remove(helper)
        this.helpers.delete(key)
      }
    }
  }

  private lightColor(comp: { color?: unknown } | undefined): string {
    return typeof comp?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(comp.color) ? comp.color : '#ffdd55'
  }

  private ensureHelper(key: string, kind: 'directional' | 'point' | 'spot'): THREE.Object3D {
    const existing = this.helpers.get(key)
    if (existing && existing.userData.kind === kind) return existing
    if (existing) {
      this.group.remove(existing)
      this.helpers.delete(key)
    }
    let helper: THREE.Object3D
    if (kind === 'directional') {
      helper = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(), DIRECTIONAL_LENGTH, 0xffdd55, 0.35, 0.2)
    } else if (kind === 'point') {
      helper = new THREE.Group()
      const marker = new THREE.Mesh(
        this.markerGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffdd55, depthTest: false, transparent: true, opacity: 0.95 }),
      )
      const range = new THREE.LineSegments(
        this.rangeGeometry,
        new THREE.LineBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.35, depthTest: false }),
      )
      helper.add(marker, range)
    } else {
      helper = new THREE.Group()
      const marker = new THREE.Mesh(
        this.markerGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffdd55, depthTest: false, transparent: true, opacity: 0.95 }),
      )
      const cone = new THREE.Mesh(
        this.coneGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffdd55, wireframe: true, transparent: true, opacity: 0.5, depthTest: false }),
      )
      helper.add(marker, cone)
    }
    helper.userData.kind = kind
    helper.name = `TrionLightHelper:${key}`
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
    this.rangeGeometry.dispose()
    this.coneGeometry.dispose()
  }
}

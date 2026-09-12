import * as THREE from 'three'
import type { Scene } from '../engine/core/Scene.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { AnimationSystem } from '../engine/systems/AnimationSystem.ts'
import type { SelectionState } from './SelectionState.ts'
import { getWorldTransform } from '../engine/components/Hierarchy.ts'

export interface EntityPickerOptions {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  getScene: () => Scene
  meshRendererSystem: MeshRendererSystem
  animationSystem?: AnimationSystem
  selectionState: SelectionState
  isGizmoInteracting?: () => boolean
  isPickable?: (entityId: number) => boolean
}

const LIGHT_COMPONENT_TYPES = ['directionalLight', 'pointLight', 'spotLight'] as const

const lightProxyGeometry = new THREE.SphereGeometry(1, 12, 8)
const lightProxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false })

/**
 * Raycast-target radius for a light pick proxy from its camera distance.
 * Keeps light helpers clickable both up close and zoomed out.
 */
export function lightPickRadius(cameraDistance: number): number {
  if (!Number.isFinite(cameraDistance)) return 0.3
  return Math.min(0.8, Math.max(0.12, cameraDistance * 0.035))
}

/**
 * Handles viewport entity picking via raycasting.
 * Performs raycasting only on user click (not per frame).
 * The reverse lookup from Three.js Object3D -> entity ID is strictly editor-owned.
 */
export class EntityPicker {
  private readonly canvas: HTMLCanvasElement
  private readonly camera: THREE.Camera
  private readonly getScene: () => Scene
  private readonly meshRendererSystem: MeshRendererSystem
  private readonly animationSystem?: AnimationSystem
  private readonly selectionState: SelectionState
  private readonly isGizmoInteracting?: () => boolean
  private isPickable?: (entityId: number) => boolean

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerCoords = new THREE.Vector2()

  private pointerDownPos = { x: 0, y: 0 }
  private pointerDownTime = 0
  private isPointerDown = false

  private gizmoActiveOnDown = false
  private enabled = true

  private readonly onPointerDown: (e: PointerEvent) => void
  private readonly onPointerUp: (e: PointerEvent) => void

  constructor(options: EntityPickerOptions) {
    this.canvas = options.canvas
    this.camera = options.camera
    this.getScene = options.getScene
    this.meshRendererSystem = options.meshRendererSystem
    this.animationSystem = options.animationSystem
    this.selectionState = options.selectionState
    this.isGizmoInteracting = options.isGizmoInteracting
    this.isPickable = options.isPickable

    this.onPointerDown = (e: PointerEvent) => {
      if (!this.enabled || e.button !== 0 || e.altKey) return
      this.gizmoActiveOnDown = Boolean(this.isGizmoInteracting?.())
      this.isPointerDown = true
      this.pointerDownPos = { x: e.clientX, y: e.clientY }
      this.pointerDownTime = performance.now()
    }

    this.onPointerUp = (e: PointerEvent) => {
      if (!this.enabled || !this.isPointerDown || e.button !== 0 || e.altKey) {
        this.isPointerDown = false
        return
      }
      this.isPointerDown = false

      if (this.gizmoActiveOnDown || this.isGizmoInteracting?.()) {
        return
      }

      const dx = e.clientX - this.pointerDownPos.x
      const dy = e.clientY - this.pointerDownPos.y
      const dist = Math.hypot(dx, dy)
      const elapsed = performance.now() - this.pointerDownTime
      if (dist > 4 || elapsed > 500) {
        return
      }

      this.pick(e.clientX, e.clientY, e.ctrlKey || e.metaKey)
    }

    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
  }

  private pick(clientX: number, clientY: number, toggle = false): void {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    this.pointerCoords.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointerCoords.y = -((clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointerCoords, this.camera)

    const scene = this.getScene()
    const entities = scene.getAllEntities()
    const candidateMeshes: THREE.Object3D[] = []
    const meshToEntityMap = new Map<THREE.Object3D, number>()
    const covered = new Set<number>()

    for (const entity of entities) {
      if (this.isPickable && !this.isPickable(entity.id)) continue
      const target = this.animationSystem?.getTarget(entity.id)
      if (target && target.parent) {
        candidateMeshes.push(target)
        meshToEntityMap.set(target, entity.id)
        covered.add(entity.id)
        continue
      }
      const mesh = this.meshRendererSystem.getMesh(entity.id)
      if (mesh) {
        candidateMeshes.push(mesh)
        meshToEntityMap.set(mesh, entity.id)
        covered.add(entity.id)
      }
    }

    // Light-only entities have no mesh to hit: raycast a detached,
    // never-rendered proxy sphere at each light's world position instead.
    // Positions resolve fresh from ECS here, so no per-frame sync is needed.
    const lightProxies: THREE.Object3D[] = []
    const proxyToEntityMap = new Map<THREE.Object3D, number>()
    for (const entity of entities) {
      if (covered.has(entity.id)) continue
      if (this.isPickable && !this.isPickable(entity.id)) continue
      let isLight = false
      for (const lightType of LIGHT_COMPONENT_TYPES) {
        if (entity.hasComponent(lightType)) {
          isLight = true
          break
        }
      }
      if (!isLight) continue
      const world = getWorldTransform(scene, entity.id)
      const position = new THREE.Vector3(world.position.x, world.position.y, world.position.z)
      const proxy = new THREE.Mesh(lightProxyGeometry, lightProxyMaterial)
      proxy.position.copy(position)
      proxy.scale.setScalar(lightPickRadius(this.camera.position.distanceTo(position)))
      proxy.updateMatrixWorld()
      lightProxies.push(proxy)
      proxyToEntityMap.set(proxy, entity.id)
    }

    if (candidateMeshes.length === 0 && lightProxies.length === 0) {
      if (!toggle) this.selectionState.select(null)
      return
    }

    const intersects = [
      ...this.raycaster.intersectObjects(candidateMeshes, true),
      ...this.raycaster.intersectObjects(lightProxies, false),
    ].sort((a, b) => a.distance - b.distance)

    if (intersects.length > 0) {
      let current: THREE.Object3D | null = intersects[0].object
      let hitEntityId: number | null = proxyToEntityMap.get(current) ?? null

      while (current && hitEntityId === null) {
        if (meshToEntityMap.has(current)) {
          hitEntityId = meshToEntityMap.get(current)!
          break
        }
        current = current.parent
      }

      if (hitEntityId !== null) {
        if (toggle) {
          this.selectionState.toggleSelection(hitEntityId)
        } else {
          this.selectionState.select(hitEntityId)
        }
      } else if (!toggle) {
        this.selectionState.select(null)
      }
    } else if (!toggle) {
      this.selectionState.select(null)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.isPointerDown = false
      this.gizmoActiveOnDown = false
    }
  }

  setPickableFilter(filter?: (entityId: number) => boolean): void {
    this.isPickable = filter
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
  }
}

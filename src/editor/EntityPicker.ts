import * as THREE from 'three'
import type { Scene } from '../engine/core/Scene.ts'
import type { MeshRendererSystem } from '../engine/graphics/MeshRendererSystem.ts'
import type { SelectionState } from './SelectionState.ts'

export interface EntityPickerOptions {
  canvas: HTMLCanvasElement
  camera: THREE.Camera
  getScene: () => Scene
  meshRendererSystem: MeshRendererSystem
  selectionState: SelectionState
  isGizmoInteracting?: () => boolean
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
  private readonly selectionState: SelectionState
  private readonly isGizmoInteracting?: () => boolean

  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerCoords = new THREE.Vector2()

  private pointerDownPos = { x: 0, y: 0 }
  private pointerDownTime = 0
  private isPointerDown = false

  private readonly onPointerDown: (e: PointerEvent) => void
  private readonly onPointerUp: (e: PointerEvent) => void

  constructor(options: EntityPickerOptions) {
    this.canvas = options.canvas
    this.camera = options.camera
    this.getScene = options.getScene
    this.meshRendererSystem = options.meshRendererSystem
    this.selectionState = options.selectionState
    this.isGizmoInteracting = options.isGizmoInteracting

    this.onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.altKey) return
      this.isPointerDown = true
      this.pointerDownPos = { x: e.clientX, y: e.clientY }
      this.pointerDownTime = performance.now()
    }

    this.onPointerUp = (e: PointerEvent) => {
      if (!this.isPointerDown || e.button !== 0 || e.altKey) {
        this.isPointerDown = false
        return
      }
      this.isPointerDown = false

      // Ignore if it was a drag (e.g. moved > 4 pixels or held too long)
      const dx = e.clientX - this.pointerDownPos.x
      const dy = e.clientY - this.pointerDownPos.y
      const dist = Math.hypot(dx, dy)
      const elapsed = performance.now() - this.pointerDownTime
      if (dist > 4 || elapsed > 500) {
        return
      }

      // Check if gizmo is currently being hovered or dragged
      if (this.isGizmoInteracting?.()) {
        return
      }

      this.pick(e.clientX, e.clientY)
    }

    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return

    this.pointerCoords.x = ((clientX - rect.left) / rect.width) * 2 - 1
    this.pointerCoords.y = -((clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.pointerCoords, this.camera)

    // Build editor-owned candidate list and reverse lookup mapping
    const scene = this.getScene()
    const entities = scene.getAllEntities()
    const candidateMeshes: THREE.Object3D[] = []
    const meshToEntityMap = new Map<THREE.Object3D, number>()

    for (const entity of entities) {
      const mesh = this.meshRendererSystem.getMesh(entity.id)
      if (mesh) {
        candidateMeshes.push(mesh)
        meshToEntityMap.set(mesh, entity.id)
      }
    }

    if (candidateMeshes.length === 0) {
      this.selectionState.select(null)
      return
    }

    // Raycast only against selectable scene meshes (recursive for mesh children)
    const intersects = this.raycaster.intersectObjects(candidateMeshes, true)

    if (intersects.length > 0) {
      let current: THREE.Object3D | null = intersects[0].object
      let hitEntityId: number | null = null

      while (current) {
        if (meshToEntityMap.has(current)) {
          hitEntityId = meshToEntityMap.get(current)!
          break
        }
        current = current.parent
      }

      if (hitEntityId !== null) {
        this.selectionState.select(hitEntityId)
      } else {
        this.selectionState.select(null)
      }
    } else {
      // Clicking empty viewport clears selection
      this.selectionState.select(null)
    }
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
  }
}

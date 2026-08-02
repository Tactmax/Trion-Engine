import * as THREE from 'three'
import type { Scene } from '../core/Scene.ts'
import type { TransformComponent } from '../components/Transform.ts'
import type { CameraComponent } from '../components/Camera.ts'
import type { Renderer } from './Renderer.ts'

/**
 * Bridges the ECS and the Three.js camera.
 *
 * Responsibilities:
 *   - Find the active camera entity (first entity with a CameraComponent).
 *   - Maintain an internal THREE.PerspectiveCamera or THREE.OrthographicCamera.
 *   - Synchronize ECS data (fov, near, far) and Transform (position, rotation).
 *   - Read the canvas aspect ratio from Renderer and apply it.
 *   - Call updateProjectionMatrix() when properties change.
 *
 * Ownership:
 *   - CameraSystem owns the Three.js camera instance.
 */
export class CameraSystem {
  private readonly scene: Scene
  private readonly renderer: Renderer

  private threeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null
  private cameraAddedToScene = false
  private activeProjectionMode: 'perspective' | 'orthographic' | null = null
  
  // Track previous state to avoid unnecessary projection matrix updates
  private prevFov = 0
  private prevSize = 0
  private prevNear = 0
  private prevFar = 0
  private prevAspect = 0

  constructor(scene: Scene, renderer: Renderer) {
    this.scene = scene
    this.renderer = renderer
  }

  /**
   * Synchronize the ECS camera data to the internal Three.js camera.
   * Returns the active Three.js camera, or null if no camera entity exists.
   */
  sync(): THREE.Camera | null {
    // Find the first entity with a camera component
    const entities = this.scene.getEntitiesWithComponent('camera')
    if (entities.length === 0) {
      return null
    }

    const entity = entities[0]
    const cameraComp = entity.getComponent<CameraComponent>('camera')!
    const transformComp = entity.getComponent<TransformComponent>('transform')

    this.ensureCameraType(cameraComp.projectionMode)
    
    if (!this.threeCamera) {
        return null;
    }

    this.syncTransform(transformComp)
    this.syncProjection(cameraComp)

    return this.threeCamera
  }

  /**
   * Ensures the internal Three.js camera matches the requested projection mode.
   * Recreates the camera if the mode changes or if it hasn't been created yet.
   */
  private ensureCameraType(mode: 'perspective' | 'orthographic'): void {
    if (this.activeProjectionMode === mode && this.threeCamera) {
      return
    }

    if (mode === 'perspective') {
      this.threeCamera = new THREE.PerspectiveCamera()
    } else {
      this.threeCamera = new THREE.OrthographicCamera()
    }

    if (this.threeCamera && !this.cameraAddedToScene) {
      this.renderer.add(this.threeCamera)
      this.cameraAddedToScene = true
    }

    this.activeProjectionMode = mode
    
    // Force projection update on next sync
    this.prevFov = 0
    this.prevSize = 0
    this.prevNear = 0
    this.prevFar = 0
    this.prevAspect = 0
  }

  private syncTransform(transform?: TransformComponent): void {
    if (!this.threeCamera || !transform) return

    this.threeCamera.position.set(
      transform.position.x,
      transform.position.y,
      transform.position.z
    )
    
    this.threeCamera.rotation.set(
      transform.rotation.x,
      transform.rotation.y,
      transform.rotation.z
    )
  }

  private syncProjection(cameraComp: CameraComponent): void {
    if (!this.threeCamera) return

    let needsUpdate = false
    const aspect = this.renderer.getAspect()

    if (this.activeProjectionMode === 'perspective') {
      const cam = this.threeCamera as THREE.PerspectiveCamera
      
      if (this.prevFov !== cameraComp.fov) {
        cam.fov = cameraComp.fov
        this.prevFov = cameraComp.fov
        needsUpdate = true
      }
      
      if (this.prevAspect !== aspect) {
        cam.aspect = aspect
        this.prevAspect = aspect
        needsUpdate = true
      }
      
    } else if (this.activeProjectionMode === 'orthographic') {
      const cam = this.threeCamera as THREE.OrthographicCamera
      const halfWidth = cameraComp.size * aspect
      
      if (this.prevSize !== cameraComp.size || this.prevAspect !== aspect) {
        cam.left = -halfWidth
        cam.right = halfWidth
        cam.top = cameraComp.size
        cam.bottom = -cameraComp.size
        
        this.prevSize = cameraComp.size
        this.prevAspect = aspect
        needsUpdate = true
      }
    }

    if (this.prevNear !== cameraComp.near) {
      this.threeCamera.near = cameraComp.near
      this.prevNear = cameraComp.near
      needsUpdate = true
    }

    if (this.prevFar !== cameraComp.far) {
      this.threeCamera.far = cameraComp.far
      this.prevFar = cameraComp.far
      needsUpdate = true
    }

    if (needsUpdate) {
      this.threeCamera.updateProjectionMatrix()
    }
  }
}

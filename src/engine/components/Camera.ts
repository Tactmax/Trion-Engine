import type { Component } from './Component.ts'

/**
 * Whether the camera projects the world with perspective foreshortening
 * or with a flat orthographic projection.
 */
export type ProjectionMode = 'perspective' | 'orthographic'

/**
 * Pure ECS data for a camera.
 *
 * Aspect ratio is NOT stored here — it is a property of the viewport
 * (canvas width / height) and belongs to the Renderer, not the entity.
 * The future CameraSystem will request it from the Renderer when building
 * or updating the underlying THREE.Camera.
 *
 * Sync path (implemented when CameraSystem arrives):
 *   CameraComponent.fov / near / far     → threeCamera.fov / near / far
 *   TransformComponent.position/rotation → threeCamera.position / quaternion
 *   Renderer.getAspect()                 → threeCamera.aspect
 *   (all followed by threeCamera.updateProjectionMatrix())
 */
export interface CameraComponent extends Component {
  readonly type: 'camera'
  projectionMode: ProjectionMode
  /** Vertical field of view in degrees. Used when projectionMode is 'perspective'. */
  fov: number
  /** Half-height of the orthographic frustum in world units. Used when projectionMode is 'orthographic'. */
  size: number
  /** Distance to the near clipping plane. */
  near: number
  /** Distance to the far clipping plane. */
  far: number
}

export interface CreateCameraOptions {
  projectionMode?: ProjectionMode
  fov?: number
  size?: number
  near?: number
  far?: number
}

/** Create a CameraComponent with sensible defaults (75° perspective, 0.1–1000). */
export function createCamera(options: CreateCameraOptions = {}): CameraComponent {
  return {
    type: 'camera',
    projectionMode: options.projectionMode ?? 'perspective',
    fov: options.fov ?? 75,
    size: options.size ?? 5,
    near: options.near ?? 0.1,
    far: options.far ?? 1000,
  }
}

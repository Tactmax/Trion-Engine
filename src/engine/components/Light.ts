import type { Component } from './Component.ts'

/**
 * Pure ECS data for a directional light. Direction comes from the entity's
 * TransformComponent: the light shines from the entity position along the
 * transform's forward (-Z) direction. Color is a `#rrggbb` hex string.
 */
export interface DirectionalLightComponent extends Component {
  readonly type: 'directionalLight'
  color: string
  intensity: number
}

/**
 * Pure ECS data for a point light. Position comes from the entity's
 * TransformComponent. Distance is the Three.js cutoff range in world units
 * (`0` means infinite range).
 */
export interface PointLightComponent extends Component {
  readonly type: 'pointLight'
  color: string
  intensity: number
  distance: number
}

/**
 * Pure ECS data for a spot light. Position and direction come from the
 * entity's TransformComponent (forward is -Z). Angle is the cone half-angle
 * in radians; penumbra is the 0..1 edge softness.
 */
export interface SpotLightComponent extends Component {
  readonly type: 'spotLight'
  color: string
  intensity: number
  distance: number
  angle: number
  penumbra: number
}

export type LightComponent = DirectionalLightComponent | PointLightComponent | SpotLightComponent

export type LightComponentType = LightComponent['type']

export interface CreateDirectionalLightOptions {
  color?: string
  intensity?: number
}

export interface CreatePointLightOptions {
  color?: string
  intensity?: number
  distance?: number
}

export interface CreateSpotLightOptions {
  color?: string
  intensity?: number
  distance?: number
  angle?: number
  penumbra?: number
}

export function createDirectionalLight(options: CreateDirectionalLightOptions = {}): DirectionalLightComponent {
  return {
    type: 'directionalLight',
    color: options.color ?? '#ffffff',
    intensity: options.intensity ?? 1,
  }
}

export function createPointLight(options: CreatePointLightOptions = {}): PointLightComponent {
  return {
    type: 'pointLight',
    color: options.color ?? '#ffffff',
    intensity: options.intensity ?? 1,
    distance: options.distance ?? 10,
  }
}

export function createSpotLight(options: CreateSpotLightOptions = {}): SpotLightComponent {
  return {
    type: 'spotLight',
    color: options.color ?? '#ffffff',
    intensity: options.intensity ?? 1,
    distance: options.distance ?? 10,
    angle: options.angle ?? Math.PI / 6,
    penumbra: options.penumbra ?? 0,
  }
}

export function createLightComponent(type: LightComponentType): LightComponent {
  switch (type) {
    case 'directionalLight':
      return createDirectionalLight()
    case 'pointLight':
      return createPointLight()
    case 'spotLight':
      return createSpotLight()
  }
}

export function isLightComponentType(type: string): type is LightComponentType {
  return type === 'directionalLight' || type === 'pointLight' || type === 'spotLight'
}

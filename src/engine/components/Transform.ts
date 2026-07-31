import type { Component } from './Component.ts'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface TransformComponent extends Component {
  type: 'transform'
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

export function createTransform(
  position: Partial<Vec3> = {},
  rotation: Partial<Vec3> = {},
  scale: Partial<Vec3> = {},
): TransformComponent {
  return {
    type: 'transform',
    position: { x: 0, y: 0, z: 0, ...position },
    rotation: { x: 0, y: 0, z: 0, ...rotation },
    scale: { x: 1, y: 1, z: 1, ...scale },
  }
}

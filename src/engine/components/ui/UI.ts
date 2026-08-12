import type { Component } from '../Component.ts'

export interface Vec2 {
  x: number
  y: number
}

export interface UIComponent extends Component {
  type: 'ui'
  position: Vec2
  size: Vec2
  visible: boolean
  backgroundColor?: string
}

export interface CreateUIOptions {
  position?: Partial<Vec2>
  size?: Partial<Vec2>
  visible?: boolean
  backgroundColor?: string
}

export function createUI(options: CreateUIOptions = {}): UIComponent {
  return {
    type: 'ui',
    position: { x: 0, y: 0, ...options.position },
    size: { x: 100, y: 100, ...options.size },
    visible: options.visible ?? true,
    backgroundColor: options.backgroundColor,
  }
}

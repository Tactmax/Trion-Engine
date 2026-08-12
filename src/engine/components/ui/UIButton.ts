import type { Component } from '../Component.ts'

/**
 * Pure ECS interaction data for UI elements.
 * Written by the UISystem, read by game scripts.
 */
export interface UIButtonComponent extends Component {
  type: 'uiButton'
  interactable: boolean
  isHovered: boolean
  isPressed: boolean
}

export interface CreateUIButtonOptions {
  interactable?: boolean
}

export function createUIButton(options: CreateUIButtonOptions = {}): UIButtonComponent {
  return {
    type: 'uiButton',
    interactable: options.interactable ?? true,
    isHovered: false,
    isPressed: false,
  }
}

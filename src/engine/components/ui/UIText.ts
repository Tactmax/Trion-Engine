import type { Component } from '../Component.ts'

export interface UITextComponent extends Component {
  type: 'uiText'
  text: string
  color: string
  fontSize: number
}

export interface CreateUITextOptions {
  text?: string
  color?: string
  fontSize?: number
}

export function createUIText(options: CreateUITextOptions = {}): UITextComponent {
  return {
    type: 'uiText',
    text: options.text ?? '',
    color: options.color ?? '#ffffff',
    fontSize: options.fontSize ?? 16,
  }
}

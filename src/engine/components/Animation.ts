import type { Component } from './Component.ts'

export interface AnimationComponent extends Component {
  readonly type: 'animation'
  assetId?: string
  clips: string[]
  activeClip?: string
  playing: boolean
  loop: boolean
}

export interface CreateAnimationOptions {
  assetId?: string
  clips?: string[]
  activeClip?: string
  playing?: boolean
  loop?: boolean
}

export function createAnimation(options: CreateAnimationOptions = {}): AnimationComponent {
  return {
    type: 'animation',
    assetId: options.assetId,
    clips: options.clips ?? [],
    activeClip: options.activeClip,
    playing: options.playing ?? false,
    loop: options.loop ?? true,
  }
}

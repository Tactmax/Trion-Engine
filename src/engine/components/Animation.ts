import type { Component } from './Component.ts'

export interface AnimationComponent extends Component {
  readonly type: 'animation'
  assetId?: string
  clips: string[]
  activeClip?: string
  playing: boolean
  loop: boolean
  /** Playback rate multiplier applied to mixer time. Defaults to 1. */
  speed: number
}

export interface CreateAnimationOptions {
  assetId?: string
  clips?: string[]
  activeClip?: string
  playing?: boolean
  loop?: boolean
  speed?: number
}

export function createAnimation(options: CreateAnimationOptions = {}): AnimationComponent {
  return {
    type: 'animation',
    assetId: options.assetId,
    clips: options.clips ?? [],
    activeClip: options.activeClip,
    playing: options.playing ?? false,
    loop: options.loop ?? true,
    speed: options.speed ?? 1,
  }
}

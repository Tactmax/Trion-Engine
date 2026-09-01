import type { Component } from './Component.ts'

export interface AudioComponent extends Component {
  readonly type: 'audio'
  assetId?: string
  playing: boolean
  loop: boolean
  volume: number
  muted: boolean
}

export interface CreateAudioOptions {
  assetId?: string
  playing?: boolean
  loop?: boolean
  volume?: number
  muted?: boolean
}

export function createAudio(options: CreateAudioOptions = {}): AudioComponent {
  return {
    type: 'audio',
    assetId: options.assetId,
    playing: options.playing ?? false,
    loop: options.loop ?? false,
    volume: options.volume ?? 1,
    muted: options.muted ?? false,
  }
}

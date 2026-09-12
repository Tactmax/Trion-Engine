import type { Component } from './Component.ts'

export interface AudioComponent extends Component {
  readonly type: 'audio'
  assetId?: string
  /** Runtime playback flag. Managed by AudioSystem; not the editor preview state. */
  playing: boolean
  loop: boolean
  volume: number
  muted: boolean
  /** Playback-rate multiplier. 1 = original pitch. */
  pitch: number
  /** Start playing automatically when Play Mode begins. */
  playOnStart: boolean
  /** False = 2D (no attenuation), true = 3D spatial with distance attenuation. */
  spatial: boolean
  /** Reference distance for 3D attenuation (PannerNode.refDistance). */
  minDistance: number
  /** Maximum distance for 3D attenuation (PannerNode.maxDistance). */
  maxDistance: number
}

export interface CreateAudioOptions {
  assetId?: string
  playing?: boolean
  loop?: boolean
  volume?: number
  muted?: boolean
  pitch?: number
  playOnStart?: boolean
  spatial?: boolean
  minDistance?: number
  maxDistance?: number
}

export function createAudio(options: CreateAudioOptions = {}): AudioComponent {
  return {
    type: 'audio',
    assetId: options.assetId,
    playing: options.playing ?? false,
    loop: options.loop ?? false,
    volume: options.volume ?? 1,
    muted: options.muted ?? false,
    pitch: options.pitch ?? 1,
    playOnStart: options.playOnStart ?? false,
    spatial: options.spatial ?? false,
    minDistance: options.minDistance ?? 1,
    maxDistance: options.maxDistance ?? 50,
  }
}

/** Defaults applied when reading stored audio data that predates newer fields. */
export const AUDIO_DEFAULTS = {
  playing: false,
  loop: false,
  volume: 1,
  muted: false,
  pitch: 1,
  playOnStart: false,
  spatial: false,
  minDistance: 1,
  maxDistance: 50,
} as const

export function resolveAudioProps(component: Partial<AudioComponent> | Record<string, unknown>): {
  assetId?: string
  playing: boolean
  loop: boolean
  volume: number
  muted: boolean
  pitch: number
  playOnStart: boolean
  spatial: boolean
  minDistance: number
  maxDistance: number
} {
  const record = component as Record<string, unknown>
  const num = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback
  const assetId = typeof record.assetId === 'string' ? (record.assetId as string) : undefined
  return {
    assetId,
    playing: bool(record.playing, AUDIO_DEFAULTS.playing),
    loop: bool(record.loop, AUDIO_DEFAULTS.loop),
    volume: num(record.volume, AUDIO_DEFAULTS.volume),
    muted: bool(record.muted, AUDIO_DEFAULTS.muted),
    pitch: num(record.pitch, AUDIO_DEFAULTS.pitch),
    playOnStart: bool(record.playOnStart, AUDIO_DEFAULTS.playOnStart),
    spatial: bool(record.spatial, AUDIO_DEFAULTS.spatial),
    minDistance: num(record.minDistance, AUDIO_DEFAULTS.minDistance),
    maxDistance: num(record.maxDistance, AUDIO_DEFAULTS.maxDistance),
  }
}

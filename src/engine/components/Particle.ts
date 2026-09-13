import type { Component } from './Component.ts'
import type { Vec3 } from './Transform.ts'

export type ParticleSimulationSpace = 'local' | 'world'

export type ParticleShape = 'point' | 'sphere' | 'box'

export interface ParticleBurst {
  /** Effect-local time in seconds at which the burst fires. */
  time: number
  /** Number of particles emitted when the burst fires. */
  count: number
}

export interface ParticleComponent extends Component {
  readonly type: 'particle'
  /** Continuous emission rate in particles per second. */
  emissionRate: number
  /** Hard cap on simultaneously alive particles for this emitter. */
  maxParticles: number
  /** Lifetime of each particle in seconds. */
  lifetime: number
  /** Length of one effect cycle in seconds. Emission stops past this when not looping. */
  duration: number
  /** Initial speed of each particle in world units per second. */
  startSpeed: number
  /** Initial particle size in world units. */
  startSize: number
  /** Particle size at the end of life. Used when useSizeOverLifetime is true. */
  endSize: number
  useSizeOverLifetime: boolean
  /** Initial particle rotation in radians (billboard roll). */
  startRotation: number
  /** Constant acceleration applied to velocity Y in units per second squared. */
  gravity: number
  /** Base emission direction (normalized by the system). */
  direction: Vec3
  /** Cone half-angle in radians around direction for random velocity spread. */
  spread: number
  simulationSpace: ParticleSimulationSpace
  looping: boolean
  /** Start playing automatically when Play Mode begins. */
  playOnStart: boolean
  /** Runtime playback flag. Managed by ParticleSystem; also drives editor preview. */
  playing: boolean
  shape: ParticleShape
  /** Emission sphere radius in world units (shape === 'sphere'). */
  shapeRadius: number
  /** Emission box half-extents in world units (shape === 'box'). */
  shapeExtents: Vec3
  /** Particle tint at spawn. `#rrggbb` hex string. */
  startColor: string
  /** Particle tint at end of life. Used when useColorOverLifetime is true. */
  endColor: string
  useColorOverLifetime: boolean
  /** Global opacity multiplier in the 0..1 range. */
  opacity: number
  /** Fade alpha in over the first 10% of life and out over the last 40%. */
  fadeAlpha: boolean
  /** Particle count emitted by a manual burst (Inspector button / system API). */
  burstCount: number
  /** Scheduled bursts fired at effect-local times each cycle. */
  bursts: ParticleBurst[]
}

export interface CreateParticleOptions {
  emissionRate?: number
  maxParticles?: number
  lifetime?: number
  duration?: number
  startSpeed?: number
  startSize?: number
  endSize?: number
  useSizeOverLifetime?: boolean
  startRotation?: number
  gravity?: number
  direction?: Partial<Vec3>
  spread?: number
  simulationSpace?: ParticleSimulationSpace
  looping?: boolean
  playOnStart?: boolean
  playing?: boolean
  shape?: ParticleShape
  shapeRadius?: number
  shapeExtents?: Partial<Vec3>
  startColor?: string
  endColor?: string
  useColorOverLifetime?: boolean
  opacity?: number
  fadeAlpha?: boolean
  burstCount?: number
  bursts?: ParticleBurst[]
}

export function createParticle(options: CreateParticleOptions = {}): ParticleComponent {
  return {
    type: 'particle',
    emissionRate: options.emissionRate ?? PARTICLE_DEFAULTS.emissionRate,
    maxParticles: options.maxParticles ?? PARTICLE_DEFAULTS.maxParticles,
    lifetime: options.lifetime ?? PARTICLE_DEFAULTS.lifetime,
    duration: options.duration ?? PARTICLE_DEFAULTS.duration,
    startSpeed: options.startSpeed ?? PARTICLE_DEFAULTS.startSpeed,
    startSize: options.startSize ?? PARTICLE_DEFAULTS.startSize,
    endSize: options.endSize ?? PARTICLE_DEFAULTS.endSize,
    useSizeOverLifetime: options.useSizeOverLifetime ?? PARTICLE_DEFAULTS.useSizeOverLifetime,
    startRotation: options.startRotation ?? PARTICLE_DEFAULTS.startRotation,
    gravity: options.gravity ?? PARTICLE_DEFAULTS.gravity,
    direction: { ...PARTICLE_DEFAULTS.direction, ...options.direction },
    spread: options.spread ?? PARTICLE_DEFAULTS.spread,
    simulationSpace: options.simulationSpace ?? PARTICLE_DEFAULTS.simulationSpace,
    looping: options.looping ?? PARTICLE_DEFAULTS.looping,
    playOnStart: options.playOnStart ?? PARTICLE_DEFAULTS.playOnStart,
    playing: options.playing ?? PARTICLE_DEFAULTS.playing,
    shape: options.shape ?? PARTICLE_DEFAULTS.shape,
    shapeRadius: options.shapeRadius ?? PARTICLE_DEFAULTS.shapeRadius,
    shapeExtents: { ...PARTICLE_DEFAULTS.shapeExtents, ...options.shapeExtents },
    startColor: options.startColor ?? PARTICLE_DEFAULTS.startColor,
    endColor: options.endColor ?? PARTICLE_DEFAULTS.endColor,
    useColorOverLifetime: options.useColorOverLifetime ?? PARTICLE_DEFAULTS.useColorOverLifetime,
    opacity: options.opacity ?? PARTICLE_DEFAULTS.opacity,
    fadeAlpha: options.fadeAlpha ?? PARTICLE_DEFAULTS.fadeAlpha,
    burstCount: options.burstCount ?? PARTICLE_DEFAULTS.burstCount,
    bursts: options.bursts ? options.bursts.map((burst) => ({ ...burst })) : [],
  }
}

/** Defaults applied when reading stored particle data that predates newer fields. */
export const PARTICLE_DEFAULTS = {
  emissionRate: 24,
  maxParticles: 240,
  lifetime: 1.6,
  duration: 5,
  startSpeed: 2.2,
  startSize: 0.28,
  endSize: 0.05,
  useSizeOverLifetime: true,
  startRotation: 0,
  gravity: -1.5,
  direction: { x: 0, y: 1, z: 0 },
  spread: 0.35,
  simulationSpace: 'local',
  looping: true,
  playOnStart: true,
  playing: true,
  shape: 'sphere',
  shapeRadius: 0.25,
  shapeExtents: { x: 0.5, y: 0.5, z: 0.5 },
  startColor: '#ffb347',
  endColor: '#ff5a3c',
  useColorOverLifetime: true,
  opacity: 0.95,
  fadeAlpha: true,
  burstCount: 24,
} as const

/** Clamp ranges enforced by the simulation (also guards runaway editor input). */
export const PARTICLE_LIMITS = {
  maxParticles: 2000,
  emissionRate: 1000,
} as const

export function resolveParticleProps(component: Partial<ParticleComponent> | Record<string, unknown>): {
  emissionRate: number
  maxParticles: number
  lifetime: number
  duration: number
  startSpeed: number
  startSize: number
  endSize: number
  useSizeOverLifetime: boolean
  startRotation: number
  gravity: number
  direction: Vec3
  spread: number
  simulationSpace: ParticleSimulationSpace
  looping: boolean
  playOnStart: boolean
  playing: boolean
  shape: ParticleShape
  shapeRadius: number
  shapeExtents: Vec3
  startColor: string
  endColor: string
  useColorOverLifetime: boolean
  opacity: number
  fadeAlpha: boolean
  burstCount: number
  bursts: ParticleBurst[]
} {
  const record = component as Record<string, unknown>
  const num = (value: unknown, fallback: number): number => {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback
  const color = (value: unknown, fallback: string): string =>
    typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
  const vec = (value: unknown, fallback: Vec3): Vec3 => {
    const v = value as Partial<Vec3> | undefined
    return {
      x: num(v?.x, fallback.x),
      y: num(v?.y, fallback.y),
      z: num(v?.z, fallback.z),
    }
  }
  const rawBursts = Array.isArray(record.bursts) ? record.bursts : []
  const bursts: ParticleBurst[] = []
  for (const entry of rawBursts) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
    const burst = entry as Record<string, unknown>
    const time = num(burst.time, NaN)
    const count = Math.floor(num(burst.count, NaN))
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(count) || count <= 0) continue
    bursts.push({ time, count })
  }
  bursts.sort((a, b) => a.time - b.time)
  const space = record.simulationSpace === 'world' ? 'world' : 'local'
  const shape: ParticleShape = record.shape === 'point' || record.shape === 'box' ? record.shape : 'sphere'
  return {
    emissionRate: Math.min(PARTICLE_LIMITS.emissionRate, Math.max(0, num(record.emissionRate, PARTICLE_DEFAULTS.emissionRate))),
    maxParticles: Math.min(PARTICLE_LIMITS.maxParticles, Math.max(1, Math.floor(num(record.maxParticles, PARTICLE_DEFAULTS.maxParticles)))),
    lifetime: Math.max(0, num(record.lifetime, PARTICLE_DEFAULTS.lifetime)),
    duration: Math.max(0, num(record.duration, PARTICLE_DEFAULTS.duration)),
    startSpeed: Math.max(0, num(record.startSpeed, PARTICLE_DEFAULTS.startSpeed)),
    startSize: Math.max(0, num(record.startSize, PARTICLE_DEFAULTS.startSize)),
    endSize: Math.max(0, num(record.endSize, PARTICLE_DEFAULTS.endSize)),
    useSizeOverLifetime: bool(record.useSizeOverLifetime, PARTICLE_DEFAULTS.useSizeOverLifetime),
    startRotation: num(record.startRotation, PARTICLE_DEFAULTS.startRotation),
    gravity: num(record.gravity, PARTICLE_DEFAULTS.gravity),
    direction: vec(record.direction, PARTICLE_DEFAULTS.direction),
    spread: Math.min(Math.PI, Math.max(0, num(record.spread, PARTICLE_DEFAULTS.spread))),
    simulationSpace: space,
    looping: bool(record.looping, PARTICLE_DEFAULTS.looping),
    playOnStart: bool(record.playOnStart, PARTICLE_DEFAULTS.playOnStart),
    playing: bool(record.playing, PARTICLE_DEFAULTS.playing),
    shape,
    shapeRadius: Math.max(0, num(record.shapeRadius, PARTICLE_DEFAULTS.shapeRadius)),
    shapeExtents: {
      x: Math.max(0, num((record.shapeExtents as Partial<Vec3> | undefined)?.x, PARTICLE_DEFAULTS.shapeExtents.x)),
      y: Math.max(0, num((record.shapeExtents as Partial<Vec3> | undefined)?.y, PARTICLE_DEFAULTS.shapeExtents.y)),
      z: Math.max(0, num((record.shapeExtents as Partial<Vec3> | undefined)?.z, PARTICLE_DEFAULTS.shapeExtents.z)),
    },
    startColor: color(record.startColor, PARTICLE_DEFAULTS.startColor),
    endColor: color(record.endColor, PARTICLE_DEFAULTS.endColor),
    useColorOverLifetime: bool(record.useColorOverLifetime, PARTICLE_DEFAULTS.useColorOverLifetime),
    opacity: Math.min(1, Math.max(0, num(record.opacity, PARTICLE_DEFAULTS.opacity))),
    fadeAlpha: bool(record.fadeAlpha, PARTICLE_DEFAULTS.fadeAlpha),
    burstCount: Math.min(PARTICLE_LIMITS.maxParticles, Math.max(0, Math.floor(num(record.burstCount, PARTICLE_DEFAULTS.burstCount)))),
    bursts,
  }
}

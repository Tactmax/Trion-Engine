import * as THREE from 'three'
import type { Scene } from '../core/Scene.ts'
import type { Entity } from '../core/Entity.ts'
import type { ParticleBurst, ParticleComponent } from '../components/Particle.ts'
import { resolveParticleProps } from '../components/Particle.ts'
import { getWorldTransform } from '../components/Hierarchy.ts'
import type { Renderer } from '../graphics/Renderer.ts'

interface ParticleRuntime {
  age: number
  life: number
  px: number
  py: number
  pz: number
  vx: number
  vy: number
  vz: number
  rotation: number
}

interface ParticleEntry {
  component: ParticleComponent
  points: THREE.Points
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
  positions: Float32Array
  colors: Float32Array
  sizes: Float32Array
  alphas: Float32Array
  rotations: Float32Array
  capacity: number
  particles: ParticleRuntime[]
  emitAccumulator: number
  effectTime: number
  firedBursts: number
  space: 'local' | 'world'
  cachedStartColor: THREE.Color
  cachedEndColor: THREE.Color
  cachedStartColorText: string
  cachedEndColorText: string
}

const VERTEX_SHADER = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
attribute float aAlpha;
attribute float aRotation;
varying vec3 vColor;
varying float vAlpha;
varying float vRotation;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vRotation = aRotation;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float distance = max(-mvPosition.z, 0.001);
  gl_PointSize = aSize * (320.0 / distance);
}
`

const FRAGMENT_SHADER = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vRotation;
void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float c = cos(vRotation);
  float s = sin(vRotation);
  uv = mat2(c, -s, s, c) * uv;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.12, d);
  if (vAlpha * soft < 0.004) discard;
  gl_FragColor = vec4(vColor, vAlpha * soft);
}
`

/**
 * CPU particle simulation with per-emitter THREE.Points rendering.
 *
 * Simulation state (particle ages, positions, velocities, emission clocks)
 * lives entirely in this system's entries, never in ECS components, so
 * previewing or running an effect never mutates the saved scene: components
 * stay plain configuration data and serialize unchanged.
 *
 * Rendering uses one THREE.Points per emitter with preallocated buffers sized
 * to `maxParticles`. No Three.js objects are created per particle; buffers
 * are reused across frames and disposed when the entry is removed. Points
 * are camera-facing billboards by construction and render with transparency.
 */
export class ParticleSystem {
  private readonly scene: Scene
  private readonly renderer: Renderer
  private readonly entries = new Map<number, ParticleEntry>()

  constructor(scene: Scene, renderer: Renderer) {
    this.scene = scene
    this.renderer = renderer
  }

  update(deltaTime: number): void {
    const dt = Number.isFinite(deltaTime) && deltaTime > 0 ? Math.min(deltaTime, 0.1) : 0
    const activeEntityIds = new Set<number>()
    const entities = this.scene.getEntitiesWithComponent('particle')

    for (const entity of entities) {
      const component = entity.getComponent<ParticleComponent>('particle')
      if (!component) continue
      activeEntityIds.add(entity.id)
      const entry = this.ensureEntry(entity, component)
      if (!entry) continue
      entry.component = component
      this.syncTransform(entry, entity.id)
      this.syncCachedColors(entry, component)
      if (!component.playing) {
        // Frozen pose, but still refresh buffers so Inspector edits to
        // color/size/opacity show immediately on paused live particles.
        this.writeBuffers(entry, component)
        continue
      }
      this.simulate(entry, entity.id, component, dt)
      this.writeBuffers(entry, component)
    }

    for (const [entityId] of this.entries) {
      if (!activeEntityIds.has(entityId)) {
        this.removeEntry(entityId)
      }
    }
  }

  /** Start playback for one emitter without resetting its particles. */
  play(entityId: number): void {
    const component = this.scene.getEntity(entityId)?.getComponent<ParticleComponent>('particle')
    if (component) component.playing = true
  }

  /** Pause playback for one emitter, freezing live particles in place. */
  pause(entityId: number): void {
    const component = this.scene.getEntity(entityId)?.getComponent<ParticleComponent>('particle')
    if (component) component.playing = false
  }

  /**
   * Stop one emitter: pause and discard every live particle plus the effect
   * clock, so the next play starts from a clean state.
   */
  stop(entityId: number): void {
    const component = this.scene.getEntity(entityId)?.getComponent<ParticleComponent>('particle')
    if (component) component.playing = false
    this.resetPlayback(entityId)
  }

  /**
   * Reset one emitter's simulation to time zero with no live particles.
   * The entry's buffers are reused; no Three.js objects are recreated.
   */
  resetPlayback(entityId: number): void {
    const entry = this.entries.get(entityId)
    if (!entry) return
    entry.particles.length = 0
    entry.emitAccumulator = 0
    entry.effectTime = 0
    entry.firedBursts = 0
    this.writeBuffers(entry, entry.component)
  }

  /**
   * Emit `count` particles immediately from one emitter. Defaults to the
   * component's configured burstCount. Works while paused (particles appear
   * frozen until playback resumes) and respects the max-particle cap.
   */
  burst(entityId: number, count?: number): void {
    const entity = this.scene.getEntity(entityId)
    const component = entity?.getComponent<ParticleComponent>('particle')
    if (!entity || !component) return
    const entry = this.ensureEntry(entity, component)
    if (!entry) return
    const props = resolveParticleProps(component as unknown as Record<string, unknown>)
    const amount = count === undefined ? props.burstCount : Math.max(0, Math.floor(count))
    if (amount <= 0 || props.lifetime <= 0) return
    for (let i = 0; i < amount; i += 1) {
      if (!this.spawnParticle(entry, entity.id, props, component)) break
    }
    this.writeBuffers(entry, component)
  }

  /**
   * Enter Play Mode: every `playOnStart` emitter is armed from a clean
   * simulation state. Non-playOnStart emitters start stopped and empty.
   */
  enterPlayMode(): void {
    for (const entity of this.scene.getEntitiesWithComponent('particle')) {
      const component = entity.getComponent<ParticleComponent>('particle')
      if (!component) continue
      const props = resolveParticleProps(component as unknown as Record<string, unknown>)
      component.playing = props.playOnStart
      const entry = this.ensureEntry(entity, component)
      if (!entry) continue
      entry.particles.length = 0
      entry.emitAccumulator = 0
      entry.effectTime = 0
      entry.firedBursts = 0
      this.writeBuffers(entry, component)
    }
  }

  /** Exit Play Mode: discard every runtime entry without touching ECS state. */
  exitPlayMode(): void {
    this.clear()
  }

  /**
   * Drop every runtime entry without touching ECS state. Call when the scene
   * is replaced or Play Mode ends so no stale particles survive; the next
   * update() rebuilds entries from current components.
   */
  clear(): void {
    for (const entityId of [...this.entries.keys()]) {
      this.removeEntry(entityId)
    }
  }

  /**
   * Borrow the runtime Points for an entity. The entry stays owned by this
   * system — callers must not dispose, remove or reparent it.
   */
  getPoints(entityId: number): THREE.Points | undefined {
    return this.entries.get(entityId)?.points
  }

  /** Number of managed runtime emitters (headless-test hook). */
  managedCount(): number {
    return this.entries.size
  }

  /** Alive particle count for one emitter (headless-test hook). */
  getAliveCount(entityId: number): number {
    return this.entries.get(entityId)?.particles.length ?? 0
  }

  /** Current effect clock for one emitter (headless-test hook). */
  getEffectTime(entityId: number): number {
    return this.entries.get(entityId)?.effectTime ?? 0
  }

  private ensureEntry(entity: Entity, component: ParticleComponent): ParticleEntry | undefined {
    const props = resolveParticleProps(component as unknown as Record<string, unknown>)
    const existing = this.entries.get(entity.id)
    if (existing) {
      if (existing.capacity !== props.maxParticles || existing.space !== props.simulationSpace) {
        this.removeEntry(entity.id)
      } else {
        return existing
      }
    }

    const capacity = props.maxParticles
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(capacity * 3)
    const colors = new Float32Array(capacity * 3)
    const sizes = new Float32Array(capacity)
    const alphas = new Float32Array(capacity)
    const rotations = new Float32Array(capacity)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))
    geometry.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1))
    geometry.setDrawRange(0, 0)
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000)

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    points.renderOrder = 10
    this.renderer.add(points)

    const entry: ParticleEntry = {
      component,
      points,
      geometry,
      material,
      positions,
      colors,
      sizes,
      alphas,
      rotations,
      capacity,
      particles: [],
      emitAccumulator: 0,
      effectTime: 0,
      firedBursts: 0,
      space: props.simulationSpace,
      cachedStartColor: new THREE.Color(props.startColor),
      cachedEndColor: new THREE.Color(props.endColor),
      cachedStartColorText: props.startColor,
      cachedEndColorText: props.endColor,
    }
    this.entries.set(entity.id, entry)
    this.syncTransform(entry, entity.id)
    this.writeBuffers(entry, component)
    return entry
  }

  private removeEntry(entityId: number): void {
    const entry = this.entries.get(entityId)
    if (!entry) return
    this.entries.delete(entityId)
    this.renderer.remove(entry.points)
    entry.geometry.dispose()
    entry.material.dispose()
  }

  private syncTransform(entry: ParticleEntry, entityId: number): void {
    if (entry.space === 'world') {
      entry.points.position.set(0, 0, 0)
      entry.points.rotation.set(0, 0, 0)
      entry.points.scale.set(1, 1, 1)
      return
    }
    const world = getWorldTransform(this.scene, entityId)
    entry.points.position.set(world.position.x, world.position.y, world.position.z)
    entry.points.rotation.set(world.rotation.x, world.rotation.y, world.rotation.z)
    entry.points.scale.set(world.scale.x, world.scale.y, world.scale.z)
  }

  private syncCachedColors(entry: ParticleEntry, component: ParticleComponent): void {
    const props = component as unknown as Record<string, unknown>
    const start = typeof props.startColor === 'string' ? props.startColor : entry.cachedStartColorText
    const end = typeof props.endColor === 'string' ? props.endColor : entry.cachedEndColorText
    if (start !== entry.cachedStartColorText) {
      entry.cachedStartColorText = start
      entry.cachedStartColor.set(start)
    }
    if (end !== entry.cachedEndColorText) {
      entry.cachedEndColorText = end
      entry.cachedEndColor.set(end)
    }
  }

  private simulate(entry: ParticleEntry, entityId: number, component: ParticleComponent, dt: number): void {
    const props = resolveParticleProps(component as unknown as Record<string, unknown>)

    if (dt > 0) {
      entry.effectTime += dt
      const cycleEnd = props.duration > 0 ? props.duration : Number.POSITIVE_INFINITY
      if (props.looping && props.duration > 0 && entry.effectTime >= props.duration) {
        entry.effectTime = entry.effectTime % props.duration
        entry.firedBursts = 0
      }
      const emitting = props.looping || entry.effectTime < cycleEnd
      if (emitting) {
        this.emitContinuous(entry, entityId, props, component, dt)
        this.emitScheduledBursts(entry, entityId, props, component)
      }
      this.integrate(entry, props, dt)
    }

    if (!props.looping && props.duration > 0 && entry.effectTime >= props.duration && entry.particles.length === 0) {
      component.playing = false
    }
  }

  private emitContinuous(
    entry: ParticleEntry,
    entityId: number,
    props: ReturnType<typeof resolveParticleProps>,
    component: ParticleComponent,
    dt: number,
  ): void {
    if (props.emissionRate <= 0 || props.lifetime <= 0) return
    entry.emitAccumulator = Math.min(entry.emitAccumulator + props.emissionRate * dt, entry.capacity)
    let count = Math.floor(entry.emitAccumulator)
    entry.emitAccumulator -= count
    while (count > 0) {
      if (!this.spawnParticle(entry, entityId, props, component)) {
        entry.emitAccumulator = 0
        break
      }
      count -= 1
    }
  }

  private emitScheduledBursts(
    entry: ParticleEntry,
    entityId: number,
    props: ReturnType<typeof resolveParticleProps>,
    component: ParticleComponent,
  ): void {
    if (props.bursts.length === 0 || props.lifetime <= 0) return
    const cycleTime = props.duration > 0 ? Math.min(entry.effectTime, props.duration) : entry.effectTime
    while (entry.firedBursts < props.bursts.length && props.bursts[entry.firedBursts].time <= cycleTime) {
      const burst: ParticleBurst = props.bursts[entry.firedBursts]
      entry.firedBursts += 1
      for (let i = 0; i < burst.count; i += 1) {
        if (!this.spawnParticle(entry, entityId, props, component)) break
      }
    }
  }

  private spawnParticle(
    entry: ParticleEntry,
    entityId: number,
    props: ReturnType<typeof resolveParticleProps>,
    component: ParticleComponent,
  ): boolean {
    if (entry.particles.length >= entry.capacity || props.lifetime <= 0) return false

    const world = getWorldTransform(this.scene, entityId)
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(world.rotation.x, world.rotation.y, world.rotation.z))
    const offset = sampleShapeOffset(props)
    offset.applyQuaternion(quaternion)

    let px: number
    let py: number
    let pz: number
    if (entry.space === 'world') {
      px = world.position.x + offset.x
      py = world.position.y + offset.y
      pz = world.position.z + offset.z
    } else {
      px = offset.x
      py = offset.y
      pz = offset.z
    }

    const direction = new THREE.Vector3(props.direction.x, props.direction.y, props.direction.z)
    if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0)
    direction.normalize()
    sampleConeDirection(direction, props.spread)
    direction.applyQuaternion(quaternion)

    entry.particles.push({
      age: 0,
      life: props.lifetime,
      px,
      py,
      pz,
      vx: direction.x * props.startSpeed,
      vy: direction.y * props.startSpeed,
      vz: direction.z * props.startSpeed,
      rotation: resolveRotation(component),
    })
    return true
  }

  private integrate(entry: ParticleEntry, props: ReturnType<typeof resolveParticleProps>, dt: number): void {
    if (dt <= 0 || entry.particles.length === 0) return
    const gravity = props.gravity
    const particles = entry.particles
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i]
      particle.age += dt
      if (particle.age >= particle.life) {
        particles[i] = particles[particles.length - 1]
        particles.pop()
        continue
      }
      particle.vy += gravity * dt
      particle.px += particle.vx * dt
      particle.py += particle.vy * dt
      particle.pz += particle.vz * dt
    }
  }

  private writeBuffers(entry: ParticleEntry, component: ParticleComponent): void {
    const props = resolveParticleProps(component as unknown as Record<string, unknown>)
    const particles = entry.particles
    const useColor = props.useColorOverLifetime
    const useSize = props.useSizeOverLifetime
    const startSize = props.startSize
    const endSize = props.endSize
    const opacity = props.opacity
    const fade = props.fadeAlpha
    const startColor = entry.cachedStartColor
    const endColor = entry.cachedEndColor

    for (let i = 0; i < particles.length; i += 1) {
      const particle = particles[i]
      const t = particle.life > 0 ? Math.min(Math.max(particle.age / particle.life, 0), 1) : 1
      entry.positions[i * 3] = particle.px
      entry.positions[i * 3 + 1] = particle.py
      entry.positions[i * 3 + 2] = particle.pz
      const r = useColor ? startColor.r + (endColor.r - startColor.r) * t : startColor.r
      const g = useColor ? startColor.g + (endColor.g - startColor.g) * t : startColor.g
      const b = useColor ? startColor.b + (endColor.b - startColor.b) * t : startColor.b
      entry.colors[i * 3] = r
      entry.colors[i * 3 + 1] = g
      entry.colors[i * 3 + 2] = b
      entry.sizes[i] = Math.max(0, useSize ? startSize + (endSize - startSize) * t : startSize)
      entry.alphas[i] = opacity * (fade ? fadeEnvelope(t) : 1)
      entry.rotations[i] = particle.rotation
    }
    entry.geometry.setDrawRange(0, particles.length)
    entry.geometry.attributes.position.needsUpdate = true
    ;(entry.geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true
    ;(entry.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
    ;(entry.geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true
    ;(entry.geometry.attributes.aRotation as THREE.BufferAttribute).needsUpdate = true
  }
}

function resolveRotation(component: ParticleComponent): number {
  const raw = (component as unknown as Record<string, unknown>).startRotation
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : 0
}

function sampleShapeOffset(props: ReturnType<typeof resolveParticleProps>): THREE.Vector3 {
  if (props.shape === 'box') {
    return new THREE.Vector3(
      (Math.random() * 2 - 1) * props.shapeExtents.x,
      (Math.random() * 2 - 1) * props.shapeExtents.y,
      (Math.random() * 2 - 1) * props.shapeExtents.z,
    )
  }
  if (props.shape === 'sphere' && props.shapeRadius > 0) {
    const direction = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
    if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0)
    direction.normalize()
    direction.multiplyScalar(props.shapeRadius * Math.cbrt(Math.random()))
    return direction
  }
  return new THREE.Vector3(0, 0, 0)
}

const coneBasisU = new THREE.Vector3()
const coneBasisV = new THREE.Vector3()

function sampleConeDirection(direction: THREE.Vector3, spread: number): void {
  if (spread <= 0) return
  if (spread >= Math.PI) {
    direction.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
    if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0)
    direction.normalize()
    return
  }
  const up = Math.abs(direction.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  coneBasisU.crossVectors(direction, up).normalize()
  coneBasisV.crossVectors(direction, coneBasisU).normalize()
  const cosMax = Math.cos(spread)
  const cosTheta = cosMax + Math.random() * (1 - cosMax)
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
  const phi = Math.random() * Math.PI * 2
  const x = direction.x * cosTheta + (coneBasisU.x * Math.cos(phi) + coneBasisV.x * Math.sin(phi)) * sinTheta
  const y = direction.y * cosTheta + (coneBasisU.y * Math.cos(phi) + coneBasisV.y * Math.sin(phi)) * sinTheta
  const z = direction.z * cosTheta + (coneBasisU.z * Math.cos(phi) + coneBasisV.z * Math.sin(phi)) * sinTheta
  direction.set(x, y, z).normalize()
}

function fadeEnvelope(t: number): number {
  const fadeIn = t <= 0 ? 0 : Math.min(t / 0.1, 1)
  const fadeOut = t >= 1 ? 0 : Math.min((1 - t) / 0.4, 1)
  const smoothIn = fadeIn * fadeIn * (3 - 2 * fadeIn)
  const smoothOut = fadeOut * fadeOut * (3 - 2 * fadeOut)
  return smoothIn * smoothOut
}

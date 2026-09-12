import type { Scene } from '../core/Scene.ts'
import type { AudioComponent } from '../components/Audio.ts'
import { resolveAudioProps } from '../components/Audio.ts'
import type { AssetManager } from '../graphics/AssetManager.ts'
import { getWorldTransform } from '../components/Hierarchy.ts'
import { trionLogger } from '../core/Logger.ts'

interface RuntimeEntry {
  component: AudioComponent
  gain: GainNode
  panner: PannerNode | null
  source: AudioBufferSourceNode | null
  assetId?: string
  playing: boolean
  spatial: boolean
}

interface PreviewEntry {
  gain: GainNode
  panner: PannerNode | null
  source: AudioBufferSourceNode | null
  assetId: string
  entityId: number
}

export interface AudioListenerPose {
  x: number
  y: number
  z: number
}

/**
 * Bridges AudioComponent state to Web Audio playback.
 * Browser audio objects remain inside this system.
 *
 * Two independent playback lanes:
 *   - Runtime: driven by `component.playing` while runtime mode is enabled
 *     (Play Mode). `enterPlayMode()` auto-starts `playOnStart` sources.
 *   - Preview: driven by explicit `startPreview/stopPreview` calls from the
 *     editor. Never touches `component.playing`, so preview state cannot
 *     leak into Play Mode snapshots or serialization.
 *
 * 2D sources connect `source -> gain -> destination`.
 * 3D sources connect `source -> gain -> panner -> destination` with the
 * listener posed from the scene camera (runtime) or an explicit editor
 * camera pose (preview).
 */
export class AudioSystem {
  private readonly scene: Scene
  private readonly assets: AssetManager
  private readonly entries = new Map<number, RuntimeEntry>()
  private readonly previews = new Map<number, PreviewEntry>()
  private readonly warned = new Set<string>()
  private context: AudioContext | null = null
  private runtimeEnabled = false
  private unlockListenerAttached = false
  private unlockHandler: (() => void) | null = null
  private previewListener: AudioListenerPose | null = null

  constructor(scene: Scene, assets: AssetManager) {
    this.scene = scene
    this.assets = assets
  }

  /** Enable/disable runtime playback. Editor toggles this on Play/Stop. */
  setRuntimeEnabled(enabled: boolean): void {
    if (enabled === this.runtimeEnabled) return
    this.runtimeEnabled = enabled
    if (enabled) {
      this.stopAllPreviews()
    } else {
      this.stopAllRuntime()
    }
  }

  isRuntimeEnabled(): boolean {
    return this.runtimeEnabled
  }

  /**
   * Enter Play Mode: previews are dropped and every `playOnStart` source is
   * armed by setting its runtime `playing` flag. The next update() starts
   * the Web Audio sources.
   */
  enterPlayMode(): void {
    this.stopAllPreviews()
    this.runtimeEnabled = true
    for (const entity of this.scene.getEntitiesWithComponent('audio')) {
      const component = entity.getComponent<AudioComponent>('audio')
      if (!component) continue
      const props = resolveAudioProps(component as unknown as Record<string, unknown>)
      if (props.playOnStart && props.assetId) {
        component.playing = true
      }
    }
  }

  /** Exit Play Mode: every runtime source is stopped. Preview stays stopped. */
  exitPlayMode(): void {
    this.runtimeEnabled = false
    this.stopAllRuntime()
    this.stopAllPreviews()
  }

  /** Editor preview camera pose used for 3D preview panning. */
  setPreviewListener(pose: AudioListenerPose | null): void {
    this.previewListener = pose
  }

  /** Explicit listener pose (used by the host for the runtime camera). */
  setListenerPosition(x: number, y: number, z: number): void {
    const context = this.context
    if (!context) return
    this.applyListenerPosition(context, x, y, z)
  }

  update(_deltaTime: number): void {
    if (this.runtimeEnabled) {
      this.updateRuntime()
    } else {
      // Runtime must stay silent outside Play Mode even if a stale
      // `playing` flag survived (e.g. legacy scene data).
      this.stopAllRuntime()
    }
    this.updatePreviews()
  }

  /** Number of entities with active runtime sources. */
  getActiveRuntimeCount(): number {
    let count = 0
    for (const entry of this.entries.values()) {
      if (entry.playing) count += 1
    }
    return count
  }

  getPreviewCount(): number {
    return this.previews.size
  }

  hasActiveAudio(): boolean {
    return this.getActiveRuntimeCount() > 0
  }

  isPreviewing(entityId: number): boolean {
    return this.previews.has(entityId)
  }

  /**
   * Start editor preview for one entity. Reads the live component settings
   * but never mutates `playing`, so the preview cannot leak into snapshots.
   * Returns false when there is nothing playable (no clip/buffer).
   */
  startPreview(entityId: number): boolean {
    if (this.runtimeEnabled) return false
    const entity = this.scene.getEntity(entityId)
    const component = entity?.getComponent<AudioComponent>('audio')
    if (!entity || !component) return false
    const props = resolveAudioProps(component as unknown as Record<string, unknown>)
    if (!props.assetId) {
      this.warnOnce('preview-missing-ref', 'Entity is missing an audio asset reference')
      return false
    }
    const buffer = this.assets.getAudioBuffer(props.assetId)
    if (!buffer) {
      this.warnOnce(`preview-missing-buffer:${props.assetId}`, `Missing audio buffer "${props.assetId}"`)
      return false
    }
    const context = this.getOrCreateContext()
    if (!context || context.state !== 'running') {
      this.attachUnlockListener()
      if (!context) return false
      void this.tryResumeContext().then((ready) => {
        if (ready && this.previews.has(entityId)) {
          // Context unlocked after the preview was requested; the next
          // updatePreviews() tick restarts it from the live settings.
          this.restartPreviewSource(entityId)
        } else if (ready) {
          this.startPreview(entityId)
        }
      })
      // Create the nodes now so isPreviewing() is truthful; audible start
      // follows the unlock.
      if (context.state !== 'running') {
        this.ensurePreviewEntry(entityId, props.assetId)
        return true
      }
    }

    this.stopPreview(entityId)
    const entry = this.ensurePreviewEntry(entityId, props.assetId)
    this.applyPreviewSettings(entry, component, entityId)
    this.startPreviewSource(entry, component, buffer, entityId)
    return true
  }

  stopPreview(entityId: number): void {
    const entry = this.previews.get(entityId)
    if (!entry) return
    this.stopPreviewSource(entry)
    try {
      entry.panner?.disconnect()
    } catch {
      // Already disconnected.
    }
    try {
      entry.gain.disconnect()
    } catch {
      // Already disconnected.
    }
    this.previews.delete(entityId)
  }

  stopAllPreviews(): void {
    for (const entityId of [...this.previews.keys()]) {
      this.stopPreview(entityId)
    }
  }

  /**
   * Drop every runtime and preview node without touching ECS state. Call
   * when the scene is replaced or Play Mode ends so no stale audio survives;
   * the next update() rebuilds entries from current components.
   */
  clear(): void {
    this.stopAllRuntime()
    this.stopAllPreviews()
  }

  dispose(): void {
    this.stopAllRuntime()
    this.stopAllPreviews()
    this.removeUnlockListener()
    if (this.context) {
      void this.context.close().catch(() => {
        // Context may already be closed.
      })
    }
    this.context = null
  }

  // ---------- runtime ----------

  private updateRuntime(): void {
    const activeEntityIds = new Set<number>()
    const entities = this.scene.getEntitiesWithComponent('audio')

    for (const entity of entities) {
      const component = entity.getComponent<AudioComponent>('audio')
      if (!component) continue

      activeEntityIds.add(entity.id)
      const entry = this.ensureEntry(entity.id, component)
      this.syncEntry(entry, component, entity.id)
    }

    for (const [entityId, entry] of this.entries.entries()) {
      if (!activeEntityIds.has(entityId)) {
        this.stopSource(entry)
        this.disconnectEntry(entry)
        this.entries.delete(entityId)
      }
    }

    // Listener needs the context, which is created lazily by ensureEntry.
    this.updateListenerFromSceneCamera()
  }

  private ensureEntry(entityId: number, component: AudioComponent): RuntimeEntry {
    const existing = this.entries.get(entityId)
    if (existing) {
      existing.component = component
      return existing
    }

    const context = this.getOrCreateContext()
    const gain = context.createGain()
    const props = resolveAudioProps(component as unknown as Record<string, unknown>)
    const panner = props.spatial ? this.createPanner(context, props.minDistance, props.maxDistance) : null
    this.connectOutput(context, gain, panner)

    const entry: RuntimeEntry = {
      component,
      gain,
      panner,
      source: null,
      assetId: undefined,
      playing: false,
      spatial: props.spatial,
    }
    this.entries.set(entityId, entry)
    return entry
  }

  private syncEntry(entry: RuntimeEntry, component: AudioComponent, entityId: number): void {
    entry.component = component
    const props = resolveAudioProps(component as unknown as Record<string, unknown>)
    entry.gain.gain.value = props.muted ? 0 : clampVolume(props.volume)

    if (entry.spatial !== props.spatial) {
      // Spatial mode changed: rebuild the output chain.
      this.stopSource(entry)
      this.disconnectEntry(entry)
      const context = this.getOrCreateContext()
      entry.panner = props.spatial ? this.createPanner(context, props.minDistance, props.maxDistance) : null
      this.connectOutput(context, entry.gain, entry.panner)
      entry.spatial = props.spatial
      entry.assetId = undefined
    } else if (entry.panner) {
      entry.panner.refDistance = sanitizeDistance(props.minDistance, 1)
      entry.panner.maxDistance = sanitizeDistance(props.maxDistance, 50)
    }

    if (entry.panner) {
      this.applySourcePosition(entry.panner, entityId)
    }

    const assetChanged = entry.assetId !== props.assetId
    if (assetChanged && entry.playing) {
      this.stopSource(entry)
    }
    entry.assetId = props.assetId

    if (!props.playing) {
      if (entry.playing) {
        this.stopSource(entry)
      }
      return
    }

    const context = this.getOrCreateContext()
    if (context.state !== 'running') {
      this.attachUnlockListener()
      void this.tryResumeContext().then((ready) => {
        if (ready && props.playing) {
          this.startPlayback(entry, component)
        }
      })
      return
    }

    if (!entry.playing || assetChanged) {
      this.startPlayback(entry, component)
      return
    }

    if (entry.source) {
      entry.source.loop = props.loop
      try {
        entry.source.playbackRate.value = clampPitch(props.pitch)
      } catch {
        // Playback-rate may throw on some backends; keep playing.
      }
    }
  }

  private startPlayback(entry: RuntimeEntry, component: AudioComponent): void {
    const props = resolveAudioProps(component as unknown as Record<string, unknown>)
    if (!props.assetId) {
      this.warnOnce('missing-ref', 'Entity is missing an audio asset reference')
      return
    }

    const buffer = this.assets.getAudioBuffer(props.assetId)
    if (!buffer) {
      this.warnOnce(`missing-buffer:${props.assetId}`, `Missing audio buffer "${props.assetId}"`)
      return
    }

    this.stopSource(entry)

    const context = this.getOrCreateContext()
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = props.loop
    try {
      source.playbackRate.value = clampPitch(props.pitch)
    } catch {
      // Ignore backend quirks; default rate still plays.
    }
    source.connect(entry.gain)
    source.onended = () => {
      if (!props.loop) {
        entry.playing = false
        entry.source = null
        component.playing = false
      }
    }

    try {
      source.start(0)
      entry.source = source
      entry.playing = true
    } catch (error) {
      trionLogger.warn('Playback could not start', { source: 'Audio', error })
      component.playing = false
      entry.playing = false
    }
  }

  private stopAllRuntime(): void {
    for (const entry of this.entries.values()) {
      this.stopSource(entry)
      this.disconnectEntry(entry)
    }
    this.entries.clear()
  }

  private stopSource(entry: RuntimeEntry): void {
    if (entry.source) {
      entry.source.onended = null
      try {
        entry.source.stop()
      } catch {
        // Source may already be stopped.
      }
      try {
        entry.source.disconnect()
      } catch {
        // Already disconnected.
      }
      entry.source = null
    }
    entry.playing = false
  }

  private disconnectEntry(entry: RuntimeEntry): void {
    try {
      entry.panner?.disconnect()
    } catch {
      // Already disconnected.
    }
    try {
      entry.gain.disconnect()
    } catch {
      // Already disconnected.
    }
  }

  // ---------- preview ----------

  private updatePreviews(): void {
    if (this.runtimeEnabled) return
    for (const [entityId, entry] of [...this.previews.entries()]) {
      const entity = this.scene.getEntity(entityId)
      const component = entity?.getComponent<AudioComponent>('audio')
      if (!entity || !component) {
        this.stopPreview(entityId)
        continue
      }
      const props = resolveAudioProps(component as unknown as Record<string, unknown>)
      if (props.assetId !== entry.assetId) {
        // Clip changed under a live preview: restart from the new clip.
        this.stopPreview(entityId)
        this.startPreview(entityId)
        continue
      }
      entry.gain.gain.value = props.muted ? 0 : clampVolume(props.volume)
      if (entry.source) {
        entry.source.loop = props.loop
        try {
          entry.source.playbackRate.value = clampPitch(props.pitch)
        } catch {
          // Keep previewing at the previous rate.
        }
      }
      if (entry.panner) {
        entry.panner.refDistance = sanitizeDistance(props.minDistance, 1)
        entry.panner.maxDistance = sanitizeDistance(props.maxDistance, 50)
        this.applySourcePosition(entry.panner, entityId)
      }
      // Audible start may have been deferred until the context unlocked.
      if (!entry.source) {
        const buffer = props.assetId ? this.assets.getAudioBuffer(props.assetId) : undefined
        const context = this.context
        if (buffer && context && context.state === 'running') {
          this.startPreviewSource(entry, component, buffer, entityId)
        }
      }
    }

    if (this.previews.size > 0) {
      this.updatePreviewListener()
    }
  }

  private ensurePreviewEntry(entityId: number, assetId: string): PreviewEntry {
    const existing = this.previews.get(entityId)
    if (existing && existing.assetId === assetId) return existing
    if (existing) this.stopPreview(entityId)

    const context = this.getOrCreateContext()
    const entity = this.scene.getEntity(entityId)
    const component = entity?.getComponent<AudioComponent>('audio')
    const props = component
      ? resolveAudioProps(component as unknown as Record<string, unknown>)
      : null
    const gain = context.createGain()
    const panner = props?.spatial ? this.createPanner(context, props.minDistance, props.maxDistance) : null
    this.connectOutput(context, gain, panner)
    const entry: PreviewEntry = { gain, panner, source: null, assetId, entityId }
    this.previews.set(entityId, entry)
    return entry
  }

  private applyPreviewSettings(entry: PreviewEntry, component: AudioComponent, entityId: number): void {
    const props = resolveAudioProps(component as unknown as Record<string, unknown>)
    entry.gain.gain.value = props.muted ? 0 : clampVolume(props.volume)
    if (entry.panner) {
      entry.panner.refDistance = sanitizeDistance(props.minDistance, 1)
      entry.panner.maxDistance = sanitizeDistance(props.maxDistance, 50)
      this.applySourcePosition(entry.panner, entityId)
    }
  }

  private startPreviewSource(
    entry: PreviewEntry,
    component: AudioComponent,
    buffer: AudioBuffer,
    entityId: number,
  ): void {
    const props = resolveAudioProps(component as unknown as Record<string, unknown>)
    const context = this.getOrCreateContext()
    this.stopPreviewSource(entry)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = props.loop
    try {
      source.playbackRate.value = clampPitch(props.pitch)
    } catch {
      // Ignore backend quirks.
    }
    source.connect(entry.gain)
    source.onended = () => {
      if (this.previews.get(entityId) !== entry) return
      if (!props.loop) {
        entry.source = null
        // Non-looping preview ends naturally; drop the entry so the
        // Inspector play state resets without touching ECS.
        this.stopPreview(entityId)
      }
    }
    try {
      source.start(0)
      entry.source = source
    } catch (error) {
      trionLogger.warn('Preview could not start', { source: 'Audio', error })
    }
  }

  private restartPreviewSource(entityId: number): void {
    const entry = this.previews.get(entityId)
    const entity = this.scene.getEntity(entityId)
    const component = entity?.getComponent<AudioComponent>('audio')
    if (!entry || !component) return
    const props = resolveAudioProps(component as unknown as Record<string, unknown>)
    if (!props.assetId) return
    const buffer = this.assets.getAudioBuffer(props.assetId)
    if (!buffer || entry.source) return
    this.applyPreviewSettings(entry, component, entityId)
    this.startPreviewSource(entry, component, buffer, entityId)
  }

  private stopPreviewSource(entry: PreviewEntry): void {
    if (entry.source) {
      entry.source.onended = null
      try {
        entry.source.stop()
      } catch {
        // Already stopped.
      }
      try {
        entry.source.disconnect()
      } catch {
        // Already disconnected.
      }
      entry.source = null
    }
  }

  // ---------- spatial ----------

  private createPanner(context: AudioContext, minDistance: number, maxDistance: number): PannerNode {
    const panner = context.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = sanitizeDistance(minDistance, 1)
    panner.rolloffFactor = 1
    panner.maxDistance = sanitizeDistance(maxDistance, 50)
    return panner
  }

  private connectOutput(context: AudioContext, gain: GainNode, panner: PannerNode | null): void {
    try {
      gain.disconnect()
    } catch {
      // Fresh node.
    }
    if (panner) {
      try {
        panner.disconnect()
      } catch {
        // Fresh node.
      }
      gain.connect(panner)
      panner.connect(context.destination)
    } else {
      gain.connect(context.destination)
    }
  }

  private applySourcePosition(panner: PannerNode, entityId: number): void {
    const world = getWorldTransform(this.scene, entityId)
    const { x, y, z } = world.position
    const positionX = (panner as unknown as { positionX?: AudioParam }).positionX
    if (positionX && (panner as unknown as { positionY?: AudioParam }).positionY) {
      try {
        panner.positionX.value = x
        ;(panner as unknown as { positionY: AudioParam }).positionY.value = y
        ;(panner as unknown as { positionZ: AudioParam }).positionZ.value = z
        return
      } catch {
        // Fall through to legacy setPosition.
      }
    }
    const legacy = panner as unknown as { setPosition?: (x: number, y: number, z: number) => void }
    try {
      legacy.setPosition?.(x, y, z)
    } catch {
      // Position update is best-effort.
    }
  }

  private updateListenerFromSceneCamera(): void {
    const context = this.context
    if (!context) return
    const pose = this.resolveSceneCameraPose()
    if (!pose) return
    this.applyListenerPosition(context, pose.x, pose.y, pose.z)
  }

  private updatePreviewListener(): void {
    const context = this.context
    if (!context) return
    const pose = this.previewListener ?? this.resolveSceneCameraPose()
    if (!pose) return
    this.applyListenerPosition(context, pose.x, pose.y, pose.z)
  }

  private resolveSceneCameraPose(): AudioListenerPose | null {
    const entities = this.scene.getEntitiesWithComponent('camera')
    if (entities.length === 0) return null
    const world = getWorldTransform(this.scene, entities[0].id)
    return { x: world.position.x, y: world.position.y, z: world.position.z }
  }

  private applyListenerPosition(context: AudioContext, x: number, y: number, z: number): void {
    const listener = context.listener
    const modern = listener as unknown as {
      positionX?: AudioParam
      positionY?: AudioParam
      positionZ?: AudioParam
    }
    if (modern.positionX && modern.positionY && modern.positionZ) {
      try {
        modern.positionX.value = x
        modern.positionY.value = y
        modern.positionZ.value = z
        return
      } catch {
        // Fall through to legacy API.
      }
    }
    const legacy = listener as unknown as { setPosition?: (x: number, y: number, z: number) => void }
    try {
      legacy.setPosition?.(x, y, z)
    } catch {
      // Listener update is best-effort.
    }
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return
    this.warned.add(key)
    trionLogger.warn(message, { source: 'Audio' })
  }

  private getOrCreateContext(): AudioContext {
    if (!this.context) {
      const factory = globalThis as unknown as { AudioContext?: new () => AudioContext }
      if (typeof factory.AudioContext === 'undefined') {
        throw new Error('Web Audio is not available in this environment')
      }
      this.context = new factory.AudioContext()
    }
    return this.context
  }

  private async tryResumeContext(): Promise<boolean> {
    const context = this.getOrCreateContext()
    if (context.state === 'suspended') {
      try {
        await context.resume()
      } catch {
        return false
      }
    }
    return context.state === 'running'
  }

  private attachUnlockListener(): void {
    if (this.unlockListenerAttached) return
    if (typeof window === 'undefined') return
    this.unlockListenerAttached = true

    this.unlockHandler = (): void => {
      void this.tryResumeContext()
      this.removeUnlockListener()
    }

    window.addEventListener('pointerdown', this.unlockHandler)
    window.addEventListener('keydown', this.unlockHandler)
  }

  private removeUnlockListener(): void {
    if (!this.unlockHandler || typeof window === 'undefined') return
    window.removeEventListener('pointerdown', this.unlockHandler)
    window.removeEventListener('keydown', this.unlockHandler)
    this.unlockHandler = null
    this.unlockListenerAttached = false
  }
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1
  return Math.min(1, Math.max(0, volume))
}

function clampPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return 1
  return Math.min(4, Math.max(0.1, pitch))
}

function sanitizeDistance(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback
  return value
}

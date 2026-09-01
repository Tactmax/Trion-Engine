import type { Scene } from '../core/Scene.ts'
import type { AudioComponent } from '../components/Audio.ts'
import type { AssetManager } from '../graphics/AssetManager.ts'

interface AudioEntry {
  component: AudioComponent
  gain: GainNode
  source: AudioBufferSourceNode | null
  assetId?: string
  playing: boolean
}

/**
 * Bridges AudioComponent state to Web Audio playback.
 * Browser audio objects remain inside this system.
 */
export class AudioSystem {
  private readonly scene: Scene
  private readonly assets: AssetManager
  private readonly entries = new Map<number, AudioEntry>()
  private context: AudioContext | null = null
  private unlockListenerAttached = false
  private unlockHandler: (() => void) | null = null

  constructor(scene: Scene, assets: AssetManager) {
    this.scene = scene
    this.assets = assets
  }

  update(_deltaTime: number): void {
    const activeEntityIds = new Set<number>()
    const entities = this.scene.getEntitiesWithComponent('audio')

    for (const entity of entities) {
      const component = entity.getComponent<AudioComponent>('audio')
      if (!component) continue

      activeEntityIds.add(entity.id)
      const entry = this.ensureEntry(entity.id, component)
      this.syncEntry(entry, component)
    }

    for (const [entityId, entry] of this.entries.entries()) {
      if (!activeEntityIds.has(entityId)) {
        this.stopSource(entry)
        entry.gain.disconnect()
        this.entries.delete(entityId)
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.stopSource(entry)
      entry.gain.disconnect()
    }
    this.entries.clear()
    this.removeUnlockListener()
    void this.context?.close()
    this.context = null
  }

  private ensureEntry(entityId: number, component: AudioComponent): AudioEntry {
    const existing = this.entries.get(entityId)
    if (existing) {
      existing.component = component
      return existing
    }

    const context = this.getOrCreateContext()
    const gain = context.createGain()
    gain.connect(context.destination)

    const entry: AudioEntry = {
      component,
      gain,
      source: null,
      assetId: undefined,
      playing: false,
    }
    this.entries.set(entityId, entry)
    return entry
  }

  private syncEntry(entry: AudioEntry, component: AudioComponent): void {
    entry.component = component
    entry.gain.gain.value = component.muted ? 0 : component.volume

    const assetChanged = entry.assetId !== component.assetId
    if (assetChanged && entry.playing) {
      this.stopSource(entry)
    }
    entry.assetId = component.assetId

    if (!component.playing) {
      if (entry.playing) {
        this.stopSource(entry)
      }
      return
    }

    const context = this.getOrCreateContext()
    if (context.state !== 'running') {
      this.attachUnlockListener()
      void this.tryResumeContext().then((ready) => {
        if (ready && component.playing) {
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
      entry.source.loop = component.loop
    }
  }

  private startPlayback(entry: AudioEntry, component: AudioComponent): void {
    if (!component.assetId) {
      console.warn('[AudioSystem] Entity is missing an audio asset reference')
      return
    }

    const buffer = this.assets.getAudioBuffer(component.assetId)
    if (!buffer) {
      console.warn(`[AudioSystem] Missing audio buffer "${component.assetId}"`)
      return
    }

    this.stopSource(entry)

    const context = this.getOrCreateContext()
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = component.loop
    source.connect(entry.gain)
    source.onended = () => {
      if (!component.loop) {
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
      console.warn('[AudioSystem] Playback could not start:', error)
      component.playing = false
      entry.playing = false
    }
  }

  private stopSource(entry: AudioEntry): void {
    if (entry.source) {
      entry.source.onended = null
      try {
        entry.source.stop()
      } catch {
        // Source may already be stopped.
      }
      entry.source.disconnect()
      entry.source = null
    }
    entry.playing = false
  }

  private getOrCreateContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext()
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
    this.unlockListenerAttached = true

    this.unlockHandler = (): void => {
      void this.tryResumeContext()
      this.removeUnlockListener()
    }

    window.addEventListener('pointerdown', this.unlockHandler)
    window.addEventListener('keydown', this.unlockHandler)
  }

  private removeUnlockListener(): void {
    if (!this.unlockHandler) return
    window.removeEventListener('pointerdown', this.unlockHandler)
    window.removeEventListener('keydown', this.unlockHandler)
    this.unlockHandler = null
    this.unlockListenerAttached = false
  }
}

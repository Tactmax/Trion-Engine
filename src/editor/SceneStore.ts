import type { SceneData } from '../engine/core/SceneSerialization.ts'

export interface StoredSceneData {
  name: string
  data: SceneData
}

interface SceneStorePayload {
  version: 1
  scenes: StoredSceneData[]
}

const STORAGE_KEY = 'trion.scenes.v1'

/**
 * Editor-only scene asset storage. Persists SceneData snapshots captured
 * through the existing Scene serializer. Never part of Scene state.
 */
export class SceneStore {
  private readonly scenes = new Map<string, SceneData>()

  constructor() {
    this.load()
  }

  listNames(): string[] {
    return [...this.scenes.keys()].sort((a, b) => a.localeCompare(b))
  }

  has(name: string): boolean {
    return this.scenes.has(name)
  }

  get(name: string): SceneData | undefined {
    return this.scenes.get(name)
  }

  save(name: string, data: SceneData): void {
    this.scenes.set(name, { entities: data.entities.map((entity) => ({ ...entity })) })
    this.persist()
  }

  remove(name: string): boolean {
    const removed = this.scenes.delete(name)
    if (removed) this.persist()
    return removed
  }

  private load(): void {
    try {
      if (typeof localStorage === 'undefined') return
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const payload = JSON.parse(raw) as Partial<SceneStorePayload>
      if (payload.version !== 1 || !Array.isArray(payload.scenes)) return
      for (const entry of payload.scenes) {
        if (isStoredScene(entry)) {
          this.scenes.set(entry.name, entry.data)
        }
      }
    } catch {
      this.scenes.clear()
    }
  }

  private persist(): void {
    try {
      const scenes: StoredSceneData[] = [...this.scenes.entries()].map(([name, data]) => ({ name, data }))
      const payload: SceneStorePayload = { version: 1, scenes }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn('[SceneStore] Failed to persist scenes:', error)
    }
  }
}

function isStoredScene(value: unknown): value is StoredSceneData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string' || record.name.length === 0) return false
  if (typeof record.data !== 'object' || record.data === null || Array.isArray(record.data)) return false
  return Array.isArray((record.data as Record<string, unknown>).entities)
}

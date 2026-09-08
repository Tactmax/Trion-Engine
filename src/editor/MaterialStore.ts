import type { MaterialDefinition } from '../engine/graphics/MaterialUtils.ts'

interface MaterialStorePayload {
  version: 1
  materials: MaterialDefinition[]
}

const STORAGE_KEY = 'trion.materials.v1'

function slugify(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'material'
}

function isMaterialDefinition(value: unknown): value is MaterialDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' && record.id.length > 0 &&
    typeof record.name === 'string' && record.name.length > 0 &&
    typeof record.color === 'string' &&
    typeof record.roughness === 'number' &&
    typeof record.metalness === 'number' &&
    typeof record.opacity === 'number' &&
    typeof record.transparent === 'boolean'
  )
}

const DEFAULT_DEFINITIONS: MaterialDefinition[] = [
  { id: 'material/default', name: 'Default', color: '#ffffff', roughness: 0.5, metalness: 0, opacity: 1, transparent: false },
  { id: 'material/metal', name: 'Metal', color: '#c0c0c0', roughness: 0.3, metalness: 1, opacity: 1, transparent: false },
  { id: 'material/plastic', name: 'Plastic', color: '#2a7fff', roughness: 0.4, metalness: 0, opacity: 1, transparent: false },
]

/**
 * Editor-side material asset storage. Persists serializable material
 * definitions (user-created materials plus prop overrides for imported
 * materials) and rebuilds live Three.js materials through AssetManager.
 * Never part of Scene state; scene files reference materials by ID only.
 */
export class MaterialStore {
  private readonly materials = new Map<string, MaterialDefinition>()

  constructor() {
    this.load()
    if (this.materials.size === 0) {
      for (const def of DEFAULT_DEFINITIONS) this.materials.set(def.id, { ...def })
      this.persist()
    }
  }

  list(): MaterialDefinition[] {
    return [...this.materials.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  listIds(): string[] {
    return [...this.materials.keys()].sort((a, b) => a.localeCompare(b))
  }

  has(id: string): boolean {
    return this.materials.has(id)
  }

  get(id: string): MaterialDefinition | undefined {
    const found = this.materials.get(id)
    return found ? { ...found } : undefined
  }

  save(def: MaterialDefinition): void {
    this.materials.set(def.id, { ...def })
    this.persist()
  }

  remove(id: string): boolean {
    const removed = this.materials.delete(id)
    if (removed) this.persist()
    return removed
  }

  /** Allocate a fresh `material/<slug>` ID that does not collide with existing entries. */
  allocateId(name: string): string {
    const base = slugify(name)
    let id = `material/${base}`
    let index = 2
    while (this.materials.has(id)) {
      id = `material/${base}-${index}`
      index += 1
    }
    return id
  }

  private load(): void {
    try {
      if (typeof localStorage === 'undefined') return
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const payload = JSON.parse(raw) as Partial<MaterialStorePayload>
      if (payload.version !== 1 || !Array.isArray(payload.materials)) return
      for (const entry of payload.materials) {
        if (isMaterialDefinition(entry)) this.materials.set(entry.id, { ...entry })
      }
    } catch {
      this.materials.clear()
    }
  }

  private persist(): void {
    try {
      if (typeof localStorage === 'undefined') return
      const payload: MaterialStorePayload = { version: 1, materials: [...this.materials.values()] }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      console.warn('[MaterialStore] Failed to persist materials:', error)
    }
  }
}

import { trionLogger } from '../engine/core/Logger.ts'

export type GizmoSpace = 'local' | 'world'

/**
 * Editor-level preferences. Plain data only: never part of Scene state and
 * never serialized into .scene files. Rotation snap is stored in degrees
 * (UI-friendly); callers convert to radians where the runtime requires it.
 */
export interface EditorPreferencesData {
  backgroundGridVisible: boolean
  backgroundGridSize: number
  backgroundGridOpacity: number
  sceneGridVisible: boolean
  sceneGridSize: number
  sceneGridDivisions: number
  sceneGridOpacity: number
  snapEnabled: boolean
  snapPosition: number
  snapRotation: number
  snapScale: number
  gizmosVisible: boolean
  gizmoSpace: GizmoSpace
  gizmoSize: number
  cameraMoveSpeed: number
  cameraOrbitSpeed: number
  cameraZoomSpeed: number
}

/** Defaults preserve the pre-preferences editor behavior. */
export const DEFAULT_EDITOR_PREFERENCES: Readonly<EditorPreferencesData> = {
  backgroundGridVisible: true,
  backgroundGridSize: 36,
  backgroundGridOpacity: 0.09,
  sceneGridVisible: true,
  sceneGridSize: 20,
  sceneGridDivisions: 20,
  sceneGridOpacity: 1,
  snapEnabled: false,
  snapPosition: 1,
  snapRotation: 15,
  snapScale: 0.1,
  gizmosVisible: true,
  gizmoSpace: 'world',
  gizmoSize: 0.85,
  cameraMoveSpeed: 5,
  cameraOrbitSpeed: 1,
  cameraZoomSpeed: 1,
}

interface PreferencesPayload {
  version: 1
  preferences: Partial<EditorPreferencesData>
}

const STORAGE_KEY = 'trion.preferences.v1'

function finiteInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  if (value < min) return min
  if (value > max) return max
  return value
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** Merge a raw (possibly corrupt) payload over the defaults. Unknown keys are ignored. */
function sanitize(raw: unknown): EditorPreferencesData {
  const source = (typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {}) as Record<string, unknown>
  const fallback = DEFAULT_EDITOR_PREFERENCES
  const space = source.gizmoSpace === 'local' || source.gizmoSpace === 'world' ? source.gizmoSpace : fallback.gizmoSpace
  return {
    backgroundGridVisible: booleanOr(source.backgroundGridVisible, fallback.backgroundGridVisible),
    backgroundGridSize: finiteInRange(source.backgroundGridSize, fallback.backgroundGridSize, 8, 128),
    backgroundGridOpacity: finiteInRange(source.backgroundGridOpacity, fallback.backgroundGridOpacity, 0, 1),
    sceneGridVisible: booleanOr(source.sceneGridVisible, fallback.sceneGridVisible),
    sceneGridSize: finiteInRange(source.sceneGridSize, fallback.sceneGridSize, 1, 200),
    sceneGridDivisions: Math.round(finiteInRange(source.sceneGridDivisions, fallback.sceneGridDivisions, 1, 200)),
    sceneGridOpacity: finiteInRange(source.sceneGridOpacity, fallback.sceneGridOpacity, 0, 1),
    snapEnabled: booleanOr(source.snapEnabled, fallback.snapEnabled),
    snapPosition: finiteInRange(source.snapPosition, fallback.snapPosition, 0.01, 100),
    snapRotation: finiteInRange(source.snapRotation, fallback.snapRotation, 0.1, 180),
    snapScale: finiteInRange(source.snapScale, fallback.snapScale, 0.01, 10),
    gizmosVisible: booleanOr(source.gizmosVisible, fallback.gizmosVisible),
    gizmoSpace: space,
    gizmoSize: finiteInRange(source.gizmoSize, fallback.gizmoSize, 0.2, 2),
    cameraMoveSpeed: finiteInRange(source.cameraMoveSpeed, fallback.cameraMoveSpeed, 0.1, 20),
    cameraOrbitSpeed: finiteInRange(source.cameraOrbitSpeed, fallback.cameraOrbitSpeed, 0.1, 10),
    cameraZoomSpeed: finiteInRange(source.cameraZoomSpeed, fallback.cameraZoomSpeed, 0.1, 10),
  }
}

/**
 * Editor-only preferences storage. Persists to localStorage like the other
 * editor stores (SceneStore/PrefabStore/MaterialStore). Not undoable and
 * never part of Scene state.
 */
export class EditorPreferences {
  private prefs: EditorPreferencesData
  private readonly listeners = new Set<() => void>()

  constructor() {
    this.prefs = sanitize(this.loadRaw())
  }

  /** Current preferences. Returns a copy; mutate via update(). */
  get(): EditorPreferencesData {
    return { ...this.prefs }
  }

  /** Merge a patch over the current preferences, persist, and notify. Unknown keys are ignored. */
  update(patch: Partial<EditorPreferencesData>): void {
    const next = sanitize({ ...this.prefs, ...patch })
    let changed = false
    for (const key of Object.keys(next) as Array<keyof EditorPreferencesData>) {
      if (next[key] !== this.prefs[key]) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.prefs = next
    this.persist()
    this.notify()
  }

  /** Restore defaults, persist, and notify. */
  reset(): void {
    this.update({ ...DEFAULT_EDITOR_PREFERENCES })
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private loadRaw(): unknown {
    try {
      if (typeof localStorage === 'undefined') return {}
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      const payload = JSON.parse(raw) as Partial<PreferencesPayload>
      if (payload.version !== 1 || typeof payload.preferences !== 'object' || payload.preferences === null) return {}
      return payload.preferences
    } catch {
      return {}
    }
  }

  private persist(): void {
    try {
      if (typeof localStorage === 'undefined') return
      const payload: PreferencesPayload = { version: 1, preferences: { ...this.prefs } }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch (error) {
      trionLogger.warn('Failed to persist editor preferences', { source: 'Editor', error })
    }
  }
}

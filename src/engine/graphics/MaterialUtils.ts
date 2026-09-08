import * as THREE from 'three'

/**
 * Editable subset of MeshStandardMaterial properties exposed through the
 * editor. All fields map directly to Three.js; no invented properties.
 */
export interface MaterialProps {
  color: string
  roughness: number
  metalness: number
  opacity: number
  transparent: boolean
}

/**
 * Serializable material asset definition. Persisted by the editor-side
 * material store and (re)registered into AssetManager on demand.
 */
export interface MaterialDefinition extends MaterialProps {
  id: string
  name: string
}

export function isMeshStandardMaterial(material: THREE.Material): material is THREE.MeshStandardMaterial {
  return (material as THREE.MeshStandardMaterial).isMeshStandardMaterial === true
}

function toHexColor(color: THREE.Color): string {
  return `#${color.getHexString()}`
}

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  return fallback
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

/** Read the editable props of a material. Returns null when nothing is editable. */
export function readMaterialProps(material: THREE.Material): MaterialProps | null {
  const anyMat = material as unknown as Record<string, unknown>
  if (typeof anyMat['color'] === 'undefined' && typeof anyMat['opacity'] === 'undefined') return null
  const color = (material as unknown as { color?: THREE.Color }).color
  const roughness = (material as unknown as { roughness?: unknown }).roughness
  const metalness = (material as unknown as { metalness?: unknown }).metalness
  const opacity = (material as unknown as { opacity?: unknown }).opacity
  const transparent = (material as unknown as { transparent?: unknown }).transparent
  return {
    color: color instanceof THREE.Color ? toHexColor(color) : '#ffffff',
    roughness: typeof roughness === 'number' ? roughness : 1,
    metalness: typeof metalness === 'number' ? metalness : 0,
    opacity: typeof opacity === 'number' ? opacity : 1,
    transparent: transparent === true,
  }
}

export function materialPropsEqual(a: MaterialProps, b: MaterialProps): boolean {
  return (
    a.color.toLowerCase() === b.color.toLowerCase() &&
    Math.abs(a.roughness - b.roughness) < 1e-6 &&
    Math.abs(a.metalness - b.metalness) < 1e-6 &&
    Math.abs(a.opacity - b.opacity) < 1e-6 &&
    a.transparent === b.transparent
  )
}

export function cloneMaterialProps(props: MaterialProps): MaterialProps {
  return { ...props }
}

/** Normalize partial user input into valid props (used before history + persistence). */
export function normalizeMaterialProps(partial: Partial<MaterialProps>, fallback: MaterialProps): MaterialProps {
  return {
    color: normalizeHex(partial.color, fallback.color),
    roughness: normalizeNumber(partial.roughness, fallback.roughness, 0, 1),
    metalness: normalizeNumber(partial.metalness, fallback.metalness, 0, 1),
    opacity: normalizeNumber(partial.opacity, fallback.opacity, 0, 1),
    transparent: partial.transparent ?? fallback.transparent,
  }
}

export const DEFAULT_MATERIAL_PROPS: MaterialProps = {
  color: '#ffffff',
  roughness: 0.5,
  metalness: 0,
  opacity: 1,
  transparent: false,
}

/** Apply props to a live material instance in place (no rebuild, shared users all update). */
export function applyMaterialProps(material: THREE.Material, props: MaterialProps): void {
  const target = material as unknown as {
    color?: THREE.Color
    roughness?: number
    metalness?: number
    opacity?: number
    transparent?: boolean
    needsUpdate?: boolean
  }
  if (target.color instanceof THREE.Color) target.color.set(props.color)
  if (typeof target.roughness === 'number') target.roughness = props.roughness
  if (typeof target.metalness === 'number') target.metalness = props.metalness
  if (typeof target.opacity === 'number') target.opacity = props.opacity
  if (typeof target.transparent === 'boolean' && target.transparent !== props.transparent) {
    target.transparent = props.transparent
    if (typeof target.needsUpdate === 'boolean') target.needsUpdate = true
  }
}

/** Create a MeshStandardMaterial instance from a definition (ownership passes to caller). */
export function createMaterialFromDefinition(def: MaterialDefinition): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(def.color),
    roughness: def.roughness,
    metalness: def.metalness,
    opacity: def.opacity,
    transparent: def.transparent,
  })
  material.name = def.name
  return material
}

/** Snapshot every material's editable props (used for Play Mode restore + tests). */
export function snapshotMaterialProps(materials: Iterable<[string, THREE.Material]>): Map<string, MaterialProps | null> {
  const out = new Map<string, MaterialProps | null>()
  for (const [id, material] of materials) {
    const props = readMaterialProps(material)
    out.set(id, props ? cloneMaterialProps(props) : null)
  }
  return out
}

/** Restore a snapshot taken with snapshotMaterialProps (removes entries the snapshot lacks). */
export function restoreMaterialSnapshot(
  get: (id: string) => THREE.Material | undefined,
  snapshot: ReadonlyMap<string, MaterialProps | null>,
): void {
  for (const [id, props] of snapshot) {
    if (!props) continue
    const material = get(id)
    if (material) applyMaterialProps(material, props)
  }
}

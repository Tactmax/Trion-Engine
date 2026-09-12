import { EditorPreferences, type EditorPreferencesData, type GizmoSpace } from './EditorPreferences.ts'
import { createDialogShell } from './Modal.ts'

export interface PreferencesPanelCallbacks {
  onClose?: () => void
}

type NumberPrefKey = {
  [K in keyof EditorPreferencesData]: EditorPreferencesData[K] extends number ? K : never
}[keyof EditorPreferencesData]

type BooleanPrefKey = {
  [K in keyof EditorPreferencesData]: EditorPreferencesData[K] extends boolean ? K : never
}[keyof EditorPreferencesData]

/**
 * Modal "Editor Preferences" dialog bound live to an EditorPreferences store.
 * Every control writes straight through to the store (which persists and
 * notifies), so the editor applies changes immediately. Follows the existing
 * Modal shell and Inspector field idioms.
 */
export class PreferencesPanel {
  private readonly parent: HTMLElement
  private readonly preferences: EditorPreferences
  private readonly callbacks: PreferencesPanelCallbacks
  private overlay: HTMLElement | null = null
  private unsubscribe: (() => void) | null = null
  private readonly controls = new Map<keyof EditorPreferencesData, HTMLInputElement | HTMLSelectElement>()

  constructor(parent: HTMLElement, preferences: EditorPreferences, callbacks?: PreferencesPanelCallbacks) {
    this.parent = parent
    this.preferences = preferences
    this.callbacks = callbacks ?? {}
  }

  isOpen(): boolean {
    return this.overlay !== null
  }

  open(): void {
    if (this.overlay) return
    const shell = createDialogShell(this.parent, 'Editor Preferences')
    shell.dialog.classList.add('is-wide')
    this.overlay = shell.overlay
    const body = shell.body
    body.appendChild(this.createSection('Background Grid', (section) => {
      this.addCheck(section, 'backgroundGridVisible', 'Visible')
      this.addNumber(section, 'backgroundGridSize', 'Size (px)', 8, 128, 1)
      this.addNumber(section, 'backgroundGridOpacity', 'Opacity', 0, 1, 0.01)
    }))
    body.appendChild(this.createSection('Scene Grid', (section) => {
      this.addCheck(section, 'sceneGridVisible', 'Visible')
      this.addNumber(section, 'sceneGridSize', 'Size', 1, 200, 1)
      this.addNumber(section, 'sceneGridDivisions', 'Divisions', 1, 200, 1)
      this.addNumber(section, 'sceneGridOpacity', 'Opacity', 0, 1, 0.01)
    }))
    body.appendChild(this.createSection('Snapping', (section) => {
      this.addCheck(section, 'snapEnabled', 'Enabled')
      this.addNumber(section, 'snapPosition', 'Position increment', 0.01, 100, 0.1)
      this.addNumber(section, 'snapRotation', 'Rotation increment (°)', 0.1, 180, 1)
      this.addNumber(section, 'snapScale', 'Scale increment', 0.01, 10, 0.05)
    }))
    body.appendChild(this.createSection('Gizmos', (section) => {
      this.addCheck(section, 'gizmosVisible', 'Visible')
      this.addSpaceSelect(section)
      this.addNumber(section, 'gizmoSize', 'Size', 0.2, 2, 0.05)
    }))
    body.appendChild(this.createSection('Editor Camera', (section) => {
      this.addNumber(section, 'cameraMoveSpeed', 'Movement sensitivity', 0.1, 20, 0.1)
      this.addNumber(section, 'cameraOrbitSpeed', 'Orbit sensitivity', 0.1, 10, 0.1)
      this.addNumber(section, 'cameraZoomSpeed', 'Zoom sensitivity', 0.1, 10, 0.1)
    }))
    const actions = document.createElement('div')
    actions.className = 'trion-editor-prefs-actions'
    const resetButton = document.createElement('button')
    resetButton.type = 'button'
    resetButton.className = 'trion-editor-button'
    resetButton.textContent = 'Reset to Defaults'
    resetButton.title = 'Restore all editor preferences to their defaults'
    resetButton.addEventListener('click', () => this.preferences.reset())
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'trion-editor-button is-primary'
    closeButton.textContent = 'Close'
    closeButton.addEventListener('click', () => this.close())
    actions.append(resetButton, closeButton)
    body.appendChild(actions)

    shell.overlay.addEventListener('click', (e) => {
      if (e.target === shell.overlay) this.close()
    })
    shell.overlay.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.stopPropagation()
        this.close()
      }
    })
    this.unsubscribe = this.preferences.onChange(() => this.syncControls())
    closeButton.focus()
  }

  close(): void {
    if (!this.overlay) return
    this.unsubscribe?.()
    this.unsubscribe = null
    this.controls.clear()
    this.overlay.remove()
    this.overlay = null
    this.callbacks.onClose?.()
  }

  dispose(): void {
    this.close()
  }

  private createSection(title: string, build: (section: HTMLElement) => void): HTMLElement {
    const section = document.createElement('section')
    section.className = 'trion-editor-component trion-editor-prefs-section'
    const heading = document.createElement('h2')
    heading.textContent = title
    section.appendChild(heading)
    build(section)
    return section
  }

  private addCheck(section: HTMLElement, key: BooleanPrefKey, label: string): void {
    const row = document.createElement('label')
    row.className = 'trion-editor-prefs-check'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = this.preferences.get()[key]
    input.setAttribute('aria-label', label)
    input.addEventListener('change', () => {
      this.preferences.update({ [key]: input.checked } as Partial<EditorPreferencesData>)
    })
    row.append(input, document.createTextNode(label))
    section.appendChild(row)
    this.controls.set(key, input)
  }

  private addNumber(
    section: HTMLElement,
    key: NumberPrefKey,
    label: string,
    min: number,
    max: number,
    step: number,
  ): void {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = label
    const input = document.createElement('input')
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.inputMode = 'decimal'
    input.setAttribute('aria-label', label)
    input.value = String(this.preferences.get()[key])
    input.addEventListener('change', () => {
      const value = input.valueAsNumber
      if (!Number.isFinite(value)) {
        input.value = String(this.preferences.get()[key])
        return
      }
      this.preferences.update({ [key]: value } as Partial<EditorPreferencesData>)
      input.value = String(this.preferences.get()[key])
    })
    field.appendChild(input)
    section.appendChild(field)
    this.controls.set(key, input)
  }

  private addSpaceSelect(section: HTMLElement): void {
    const field = document.createElement('label')
    field.className = 'trion-editor-field'
    field.textContent = 'Transform space'
    const select = document.createElement('select')
    select.className = 'trion-editor-select'
    select.setAttribute('aria-label', 'Transform space')
    for (const space of ['world', 'local'] as const) {
      const option = document.createElement('option')
      option.value = space
      option.textContent = space === 'world' ? 'World' : 'Local'
      select.appendChild(option)
    }
    select.value = this.preferences.get().gizmoSpace
    select.addEventListener('change', () => {
      const space: GizmoSpace = select.value === 'local' ? 'local' : 'world'
      this.preferences.update({ gizmoSpace: space })
      select.value = this.preferences.get().gizmoSpace
    })
    field.appendChild(select)
    section.appendChild(field)
    this.controls.set('gizmoSpace', select)
  }

  /** Refresh control values from the store (e.g. after Reset to Defaults). */
  private syncControls(): void {
    if (!this.overlay) return
    const prefs = this.preferences.get()
    for (const [key, control] of this.controls) {
      if (control instanceof HTMLSelectElement) {
        control.value = String(prefs[key])
        continue
      }
      if (control.type === 'checkbox') {
        control.checked = Boolean(prefs[key])
        continue
      }
      if (document.activeElement !== control) {
        control.value = String(prefs[key])
      }
    }
  }
}

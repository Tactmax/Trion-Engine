export interface PromptDialogOptions {
  title: string
  label?: string
  initialValue?: string
  confirmText?: string
  validate?: (value: string) => string | null
}

export interface ConfirmDialogOptions {
  title: string
  message: string
  confirmText?: string
  danger?: boolean
}

export interface OptionsDialogAction {
  id: string
  label: string
  primary?: boolean
}

export interface OptionsDialogOptions {
  title: string
  message: string
  actions: OptionsDialogAction[]
}

interface DialogShell {
  overlay: HTMLElement
  body: HTMLElement
  close: () => void
}

function createDialogShell(parent: HTMLElement, title: string): DialogShell {
  const overlay = document.createElement('div')
  overlay.className = 'trion-editor-modal-overlay'
  const dialog = document.createElement('div')
  dialog.className = 'trion-editor-modal'
  dialog.setAttribute('role', 'dialog')
  const heading = document.createElement('h2')
  heading.textContent = title
  const body = document.createElement('div')
  body.className = 'trion-editor-modal-body'
  dialog.append(heading, body)
  overlay.appendChild(dialog)
  parent.appendChild(overlay)
  return { overlay, body, close: () => overlay.remove() }
}

function appendDialogActions(body: HTMLElement, confirmText: string, danger: boolean, onConfirm: () => void, onCancel: () => void): void {
  const actions = document.createElement('div')
  actions.className = 'trion-editor-modal-actions'
  const cancelButton = document.createElement('button')
  cancelButton.type = 'button'
  cancelButton.className = 'trion-editor-button'
  cancelButton.textContent = 'Cancel'
  cancelButton.addEventListener('click', onCancel)
  const confirmButton = document.createElement('button')
  confirmButton.type = 'button'
  confirmButton.className = `trion-editor-button ${danger ? 'is-stop' : 'is-primary'}`
  confirmButton.textContent = confirmText
  confirmButton.addEventListener('click', onConfirm)
  actions.append(cancelButton, confirmButton)
  body.appendChild(actions)
  cancelButton.focus()
}

/** In-editor text prompt. Resolves to the trimmed value, or null on cancel. */
export function showPromptDialog(parent: HTMLElement, options: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const { overlay, body, close } = createDialogShell(parent, options.title)
    let settled = false
    const cancel = (): void => {
      if (settled) return
      settled = true
      close()
      resolve(null)
    }
    const label = document.createElement('label')
    if (options.label) {
      const caption = document.createElement('span')
      caption.textContent = options.label
      label.appendChild(caption)
    }
    const input = document.createElement('input')
    input.type = 'text'
    input.value = options.initialValue ?? ''
    if (options.label) input.setAttribute('aria-label', options.label)
    label.appendChild(input)
    const error = document.createElement('p')
    error.className = 'trion-editor-modal-error'
    error.hidden = true
    const submit = (): void => {
      if (settled) return
      const value = input.value.trim()
      const problem = options.validate?.(value) ?? (value ? null : 'Enter a value.')
      if (problem) {
        error.textContent = problem
        error.hidden = false
        input.focus()
        return
      }
      settled = true
      close()
      resolve(value)
    }
    input.addEventListener('keydown', (e) => {
      if (e.code === 'Enter') {
        e.preventDefault()
        submit()
      } else if (e.code === 'Escape') {
        cancel()
      }
    })
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel()
    })
    body.append(label, error)
    appendDialogActions(body, options.confirmText ?? 'OK', false, submit, cancel)
    input.focus()
    input.select()
  })
}

/** In-editor confirmation. Resolves true on confirm, false on cancel. */
export function showConfirmDialog(parent: HTMLElement, options: ConfirmDialogOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const { overlay, body, close } = createDialogShell(parent, options.title)
    let settled = false
    const done = (value: boolean): void => {
      if (settled) return
      settled = true
      close()
      resolve(value)
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(false)
    })
    const message = document.createElement('p')
    message.className = 'trion-editor-modal-message'
    message.textContent = options.message
    body.appendChild(message)
    appendDialogActions(body, options.confirmText ?? 'OK', options.danger ?? false, () => done(true), () => done(false))
  })
}

/**
 * In-editor multi-choice dialog. Resolves to the chosen action id,
 * or null on cancel/backdrop/Escape.
 */
export function showOptionsDialog(parent: HTMLElement, options: OptionsDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const { overlay, body, close } = createDialogShell(parent, options.title)
    let settled = false
    const done = (id: string | null): void => {
      if (settled) return
      settled = true
      close()
      resolve(id)
    }
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null)
    })
    const message = document.createElement('p')
    message.className = 'trion-editor-modal-message'
    message.textContent = options.message
    body.appendChild(message)
    const actions = document.createElement('div')
    actions.className = 'trion-editor-modal-actions is-start'
    let lastButton: HTMLButtonElement | null = null
    for (const action of options.actions) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `trion-editor-button${action.primary ? ' is-primary' : ''}`
      button.textContent = action.label
      const id = action.id
      button.addEventListener('click', () => done(id))
      actions.appendChild(button)
      lastButton = button
    }
    body.appendChild(actions)
    lastButton?.focus()
    overlay.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') done(null)
    })
  })
}

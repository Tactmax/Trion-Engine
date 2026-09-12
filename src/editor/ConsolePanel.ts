import { formatLogTime, trionLogger, type LogEntry, type Logger, type LogLevel } from '../engine/core/Logger.ts'

export type ConsoleFilter = 'all' | LogLevel

export interface ConsolePanelOptions {
  logger?: Logger
}

const FILTERS: Array<{ id: ConsoleFilter; label: string; title: string }> = [
  { id: 'all', label: 'All', title: 'Show all messages' },
  { id: 'info', label: 'Logs', title: 'Show info messages' },
  { id: 'warn', label: 'Warnings', title: 'Show warnings' },
  { id: 'error', label: 'Errors', title: 'Show errors' },
]

const NEAR_BOTTOM_PX = 28

export function filterLogEntries(entries: readonly LogEntry[], filter: ConsoleFilter): LogEntry[] {
  if (filter === 'all') return [...entries]
  return entries.filter((entry) => entry.level === filter)
}

function levelLabel(level: LogLevel): string {
  switch (level) {
    case 'info':
      return 'INFO'
    case 'warn':
      return 'WARN'
    case 'error':
      return 'ERROR'
  }
}

/** Bottom-docked editor console over the shared runtime logger. Observational only: never touches history. */
export class ConsolePanel {
  readonly element: HTMLElement
  readonly resizeHandle: HTMLElement
  private readonly logger: Logger
  private readonly list: HTMLElement
  private readonly emptyState: HTMLElement
  private readonly countLabel: HTMLElement
  private readonly filterButtons = new Map<ConsoleFilter, HTMLButtonElement>()
  private readonly collapseButton: HTMLButtonElement
  private readonly autoScrollButton: HTMLButtonElement
  private filter: ConsoleFilter = 'all'
  private collapsed = false
  private autoScroll = true
  private readonly unsubscribe: () => void
  private lastRenderedLastId = -1
  private lastRenderedFilter: ConsoleFilter | null = null

  constructor(options: ConsolePanelOptions = {}) {
    this.logger = options.logger ?? trionLogger

    this.element = document.createElement('aside')
    this.element.className = 'trion-editor-panel trion-editor-console'

    this.resizeHandle = document.createElement('div')
    this.resizeHandle.className = 'trion-editor-console-resize'
    this.resizeHandle.title = 'Drag to resize console'

    const header = document.createElement('div')
    header.className = 'trion-editor-panel-header trion-editor-console-header'

    const titleWrap = document.createElement('div')
    titleWrap.className = 'trion-editor-console-title'
    const title = document.createElement('span')
    title.textContent = 'Console'
    this.countLabel = document.createElement('span')
    this.countLabel.className = 'trion-editor-panel-context'
    titleWrap.append(title, this.countLabel)

    const controls = document.createElement('div')
    controls.className = 'trion-editor-console-controls'

    for (const { id, label, title: buttonTitle } of FILTERS) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'trion-editor-button trion-editor-console-filter'
      if (id === 'all') button.classList.add('is-active')
      button.textContent = label
      button.title = buttonTitle
      button.setAttribute('aria-pressed', id === 'all' ? 'true' : 'false')
      button.addEventListener('click', () => this.setFilter(id))
      this.filterButtons.set(id, button)
      controls.appendChild(button)
    }

    this.autoScrollButton = document.createElement('button')
    this.autoScrollButton.type = 'button'
    this.autoScrollButton.className = 'trion-editor-button trion-editor-console-filter is-active'
    this.autoScrollButton.textContent = 'Autoscroll'
    this.autoScrollButton.title = 'Auto-scroll to new messages when near the bottom'
    this.autoScrollButton.setAttribute('aria-pressed', 'true')
    this.autoScrollButton.addEventListener('click', () => this.setAutoScroll(!this.autoScroll))
    controls.appendChild(this.autoScrollButton)

    const clearButton = document.createElement('button')
    clearButton.type = 'button'
    clearButton.className = 'trion-editor-button'
    clearButton.textContent = 'Clear'
    clearButton.title = 'Clear console messages'
    clearButton.addEventListener('click', () => this.clear())
    controls.appendChild(clearButton)

    this.collapseButton = document.createElement('button')
    this.collapseButton.type = 'button'
    this.collapseButton.className = 'trion-editor-button'
    this.collapseButton.textContent = '▾'
    this.collapseButton.title = 'Collapse console'
    this.collapseButton.setAttribute('aria-expanded', 'true')
    this.collapseButton.addEventListener('click', () => this.setCollapsed(!this.collapsed))
    controls.appendChild(this.collapseButton)

    header.append(titleWrap, controls)

    this.list = document.createElement('div')
    this.list.className = 'trion-editor-console-list'
    this.list.setAttribute('role', 'log')
    this.list.setAttribute('aria-label', 'Editor console messages')

    this.emptyState = document.createElement('div')
    this.emptyState.className = 'trion-editor-console-empty'
    this.emptyState.textContent = 'No messages.'
    this.list.appendChild(this.emptyState)

    this.element.append(this.resizeHandle, header, this.list)

    this.unsubscribe = this.logger.subscribe(() => this.render())
    this.render()
  }

  getFilter(): ConsoleFilter {
    return this.filter
  }

  setFilter(filter: ConsoleFilter): void {
    if (this.filter === filter) return
    this.filter = filter
    for (const [id, button] of this.filterButtons) {
      const active = id === filter
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-pressed', String(active))
    }
    this.render()
  }

  isCollapsed(): boolean {
    return this.collapsed
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed
    this.element.classList.toggle('is-collapsed', collapsed)
    this.collapseButton.textContent = collapsed ? '▸' : '▾'
    this.collapseButton.title = collapsed ? 'Expand console' : 'Collapse console'
    this.collapseButton.setAttribute('aria-expanded', String(!collapsed))
  }

  isAutoScrollEnabled(): boolean {
    return this.autoScroll
  }

  setAutoScroll(enabled: boolean): void {
    this.autoScroll = enabled
    this.autoScrollButton.classList.toggle('is-active', enabled)
    this.autoScrollButton.setAttribute('aria-pressed', String(enabled))
    if (enabled) this.scrollToBottom()
  }

  clear(): void {
    this.logger.clear()
  }

  getVisibleEntries(): LogEntry[] {
    return filterLogEntries(this.logger.getEntries(), this.filter)
  }

  dispose(): void {
    this.unsubscribe()
    this.element.remove()
  }

  private render(): void {
    const all = this.logger.getEntries()
    const visible = filterLogEntries(all, this.filter)
    const lastId = all.length > 0 ? all[all.length - 1].id : -1
    if (lastId === this.lastRenderedLastId && this.lastRenderedFilter === this.filter) {
      this.updateCount(all, visible)
      return
    }
    const stick = this.isNearBottom()
    this.list.replaceChildren()
    if (visible.length === 0) {
      this.emptyState.textContent = all.length === 0 ? 'No messages.' : 'No messages match this filter.'
      this.list.appendChild(this.emptyState)
    } else {
      for (const entry of visible) {
        this.list.appendChild(this.createRow(entry))
      }
    }
    this.lastRenderedLastId = lastId
    this.lastRenderedFilter = this.filter
    this.updateCount(all, visible)
    if (stick) this.scrollToBottom()
  }

  private updateCount(all: readonly LogEntry[], visible: readonly LogEntry[]): void {
    this.countLabel.textContent = this.filter === 'all'
      ? `${all.length}`
      : `${visible.length} / ${all.length}`
  }

  private createRow(entry: LogEntry): HTMLElement {
    const row = document.createElement('div')
    row.className = `trion-editor-console-row is-${entry.level}`
    row.dataset.entryId = String(entry.id)

    const time = document.createElement('span')
    time.className = 'trion-editor-console-time'
    time.textContent = formatLogTime(entry.timestamp)
    time.title = new Date(entry.timestamp).toLocaleString()

    const level = document.createElement('span')
    level.className = `trion-editor-console-level is-${entry.level}`
    level.textContent = levelLabel(entry.level)

    const body = document.createElement('div')
    body.className = 'trion-editor-console-body'

    const message = document.createElement('span')
    message.className = 'trion-editor-console-message'
    if (entry.source) {
      const source = document.createElement('span')
      source.className = 'trion-editor-console-source'
      source.textContent = `[${entry.source}]`
      message.append(source, document.createTextNode(` ${entry.message}`))
    } else {
      message.textContent = entry.message
    }
    message.title = 'Click to copy message'
    body.appendChild(message)

    if (entry.details) {
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'trion-editor-console-toggle'
      toggle.textContent = '▸ details'
      toggle.title = 'Show error details'
      const details = document.createElement('pre')
      details.className = 'trion-editor-console-details'
      details.textContent = entry.details
      details.hidden = true
      toggle.addEventListener('click', (e) => {
        e.stopPropagation()
        const open = details.hidden
        details.hidden = !open
        toggle.textContent = open ? '▾ details' : '▸ details'
        toggle.title = open ? 'Hide error details' : 'Show error details'
        if (open) this.maybeStickToBottom()
      })
      body.appendChild(toggle)
      body.appendChild(details)
      row.title = entry.message
      row.addEventListener('click', () => {
        if (details.hidden) toggle.click()
      })
    }

    message.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      void this.copyText(entry)
    })

    row.append(time, level, body)
    return row
  }

  private async copyText(entry: LogEntry): Promise<void> {
    const text = entry.details
      ? `${formatLogTime(entry.timestamp)} ${levelLabel(entry.level)}${entry.source ? ` [${entry.source}]` : ''} ${entry.message}\n${entry.details}`
      : `${formatLogTime(entry.timestamp)} ${levelLabel(entry.level)}${entry.source ? ` [${entry.source}]` : ''} ${entry.message}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard may be unavailable; selection remains possible.
    }
  }

  private isNearBottom(): boolean {
    if (!this.autoScroll) return false
    const distance = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight
    return distance <= NEAR_BOTTOM_PX
  }

  private maybeStickToBottom(): void {
    if (this.isNearBottom()) this.scrollToBottom()
  }

  private scrollToBottom(): void {
    this.list.scrollTop = this.list.scrollHeight
  }
}

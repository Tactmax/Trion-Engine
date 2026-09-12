export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  level: LogLevel
  message: string
  timestamp: number
  source?: string
  details?: string
}

export interface LogOptions {
  source?: string
  details?: string
  error?: unknown
  timestamp?: number
}

export interface LoggerOptions {
  maxEntries?: number
  mirrorToConsole?: boolean
}

export const DEFAULT_LOG_MAX_ENTRIES = 500

function extractDetails(error: unknown): string | undefined {
  if (error === undefined || error === null) return undefined
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`
  }
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function combineDetails(explicit: string | undefined, error: unknown): string | undefined {
  const fromError = error === undefined ? undefined : extractDetails(error)
  if (explicit && fromError) return `${explicit}\n${fromError}`
  return explicit ?? fromError
}

/**
 * Framework-agnostic structured log store.
 * No DOM, no Three.js, no editor dependencies — safe for runtime use
 * outside the editor. The editor console subscribes to it.
 */
export class Logger {
  private entries: LogEntry[] = []
  private readonly listeners = new Set<() => void>()
  private nextId = 0
  private maxEntries: number
  private mirrorToConsole: boolean

  constructor(options: LoggerOptions = {}) {
    this.maxEntries = normalizeMaxEntries(options.maxEntries ?? DEFAULT_LOG_MAX_ENTRIES)
    this.mirrorToConsole = options.mirrorToConsole ?? false
  }

  info(message: string, options: LogOptions = {}): LogEntry {
    return this.push('info', message, options)
  }

  warn(message: string, options: LogOptions = {}): LogEntry {
    return this.push('warn', message, options)
  }

  error(message: string, options: LogOptions = {}): LogEntry {
    return this.push('error', message, options)
  }

  getEntries(): readonly LogEntry[] {
    return this.entries
  }

  clear(): void {
    if (this.entries.length === 0) return
    this.entries = []
    this.notify()
  }

  setMaxEntries(maxEntries: number): void {
    this.maxEntries = normalizeMaxEntries(maxEntries)
    this.trim()
    this.notify()
  }

  getMaxEntries(): number {
    return this.maxEntries
  }

  setMirrorToConsole(mirror: boolean): void {
    this.mirrorToConsole = mirror
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private push(level: LogLevel, message: string, options: LogOptions): LogEntry {
    const entry: LogEntry = {
      id: this.nextId++,
      level,
      message,
      timestamp: options.timestamp ?? Date.now(),
      source: options.source,
      details: combineDetails(options.details, options.error),
    }
    this.entries.push(entry)
    this.trim()
    this.notify()
    this.mirror(level, entry)
    return entry
  }

  private trim(): void {
    if (this.entries.length <= this.maxEntries) return
    this.entries.splice(0, this.entries.length - this.maxEntries)
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      } catch {
        // Listener failures must never break logging.
      }
    }
  }

  private mirror(level: LogLevel, entry: LogEntry): void {
    if (!this.mirrorToConsole) return
    if (typeof console === 'undefined') return
    const prefix = entry.source ? `[Trion] [${entry.source}] ${entry.message}` : `[Trion] ${entry.message}`
    try {
      if (entry.details !== undefined) {
        if (level === 'error') console.error(prefix, '\n' + entry.details)
        else if (level === 'warn') console.warn(prefix, '\n' + entry.details)
        else console.info(prefix, '\n' + entry.details)
      } else {
        if (level === 'error') console.error(prefix)
        else if (level === 'warn') console.warn(prefix)
        else console.info(prefix)
      }
    } catch {
      // Console mirroring must never throw.
    }
  }
}

function normalizeMaxEntries(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LOG_MAX_ENTRIES
  return Math.max(1, Math.floor(value))
}

export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const trionLogger = new Logger({ maxEntries: DEFAULT_LOG_MAX_ENTRIES, mirrorToConsole: true })

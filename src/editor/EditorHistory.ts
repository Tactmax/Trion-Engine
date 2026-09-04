import type { Component } from '../engine/components/Component.ts'
import type { Vec3 } from '../engine/components/Transform.ts'

export interface TransformData {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

export interface HistoryCommand {
  description?: string
  undo(): void
  redo(): void
}

export function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (!isPlainObject(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function cloneComponent<T extends Component>(component: T): T {
  return cloneValue(component) as T
}

export function transformsEqual(a: TransformData, b: TransformData, eps = 1e-5): boolean {
  return (
    Math.abs(a.position.x - b.position.x) < eps &&
    Math.abs(a.position.y - b.position.y) < eps &&
    Math.abs(a.position.z - b.position.z) < eps &&
    Math.abs(a.rotation.x - b.rotation.x) < eps &&
    Math.abs(a.rotation.y - b.rotation.y) < eps &&
    Math.abs(a.rotation.z - b.rotation.z) < eps &&
    Math.abs(a.scale.x - b.scale.x) < eps &&
    Math.abs(a.scale.y - b.scale.y) < eps &&
    Math.abs(a.scale.z - b.scale.z) < eps
  )
}

/**
 * Editor-side Undo/Redo manager.
 * Tracks meaningful editor commands without interfering with runtime execution.
 */
export class EditorHistory {
  private readonly undoStack: HistoryCommand[] = []
  private readonly redoStack: HistoryCommand[] = []
  private readonly maxHistory: number
  private disabled = false
  private readonly onChange?: () => void

  constructor(maxHistory = 50, onChange?: () => void) {
    this.maxHistory = maxHistory
    this.onChange = onChange
  }

  execute(command: HistoryCommand): void {
    if (this.disabled) return
    this.undoStack.push(command)
    this.redoStack.length = 0
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift()
    }
    this.onChange?.()
  }

  undo(): boolean {
    if (this.disabled || this.undoStack.length === 0) return false
    const command = this.undoStack.pop()!
    command.undo()
    this.redoStack.push(command)
    this.onChange?.()
    return true
  }

  redo(): boolean {
    if (this.disabled || this.redoStack.length === 0) return false
    const command = this.redoStack.pop()!
    command.redo()
    this.undoStack.push(command)
    this.onChange?.()
    return true
  }

  canUndo(): boolean {
    return !this.disabled && this.undoStack.length > 0
  }

  canRedo(): boolean {
    return !this.disabled && this.redoStack.length > 0
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled
    this.onChange?.()
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.onChange?.()
  }
}

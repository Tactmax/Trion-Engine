/** Base contract for all engine components. */
export interface Component {
  readonly type: string
  update?(deltaTime: number): void
}

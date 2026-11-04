/**
 * "Ensinar a persona" (W2-10) — what the consent step hands to the recording step.
 * The recorder holds a live stream, so it cannot sit in the (serializable) shell state; one recording runs at a time,
 * so a single slot is enough. The recording screen takes it exactly once.
 */
import type { TeachRecorder } from './teach-recorder.ts'

export interface TeachHandoff {
  readonly recorder: TeachRecorder
  readonly sourceId: string
}

let pending: TeachHandoff | null = null

export function setTeachHandoff(handoff: TeachHandoff): void {
  pending = handoff
}

/** Take the pending handoff (and clear it). `null` when nothing was handed over. */
export function takeTeachHandoff(): TeachHandoff | null {
  const taken = pending
  pending = null
  return taken
}

export function clearTeachHandoff(): void {
  pending = null
}

// The control that opened "Ensinar": when the whole flow ends, focus goes back there (keyboard users keep their place).
let opener: Element | null = null

/** Remember the opener once per flow ("Gravar de novo" must not replace it with a control that is about to disappear). */
export function rememberTeachOpener(element: Element | null): void {
  if (opener === null) opener = element
}

/** The flow ended without a recording (cancelled): drop the remembered opener (the modal already returned focus). */
export function forgetTeachOpener(): void {
  opener = null
}

/** Give focus back to the opener (if it is still on the page) and forget it. */
export function restoreTeachOpener(): void {
  const target = opener
  opener = null
  if (target instanceof HTMLElement && target.isConnected) target.focus()
}

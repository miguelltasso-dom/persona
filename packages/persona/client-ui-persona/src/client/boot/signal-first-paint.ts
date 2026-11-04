/** BOOT-SPEC: renderer tells desktop the first real frame is on screen. */

export const PERSONA_FIRST_PAINT_EVENT = 'persona:first-paint'

/** Idempotent. Safe before `document` exists in non-DOM tests. */
export function signalPersonaFirstPaint(target: Pick<Document, 'documentElement' | 'dispatchEvent'> | null = typeof document === 'undefined' ? null : document): void {
  if (target === null) return
  if (target.documentElement.dataset.personaFirstPaint === '1') return
  target.documentElement.dataset.personaFirstPaint = '1'
  target.dispatchEvent(new CustomEvent(PERSONA_FIRST_PAINT_EVENT, { bubbles: true }))
}

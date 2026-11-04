/**
 * Restore focus to the channel/DM composer (T3-UX-HARVEST §1; pattern from t3code docs/user/keyboard-focus.md, MIT).
 */

export const PERSONA_FOCUS_COMPOSER_EVENT = 'persona:focus-composer'

/** Ask the mounted composer field to focus (e.g. after closing Busca / Ctrl K). */
export function requestComposerFocus(): void {
  window.dispatchEvent(new Event(PERSONA_FOCUS_COMPOSER_EVENT))
}

export function findComposerTextarea(root: ParentNode = document): HTMLTextAreaElement | null {
  return root.querySelector<HTMLTextAreaElement>('form[data-persona-area="composer"] textarea')
}

/** Listen once app-wide (safe to call from shell and chat surfaces). */
export function installComposerFocusRestore(doc: Document = document): () => void {
  const onEvent = (): void => {
    requestAnimationFrame(() => { findComposerTextarea(doc)?.focus() })
  }
  window.addEventListener(PERSONA_FOCUS_COMPOSER_EVENT, onEvent)
  return () => { window.removeEventListener(PERSONA_FOCUS_COMPOSER_EVENT, onEvent) }
}

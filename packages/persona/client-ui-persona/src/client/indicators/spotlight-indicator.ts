/**
 * "Ver o número" (the fall notice of "Seus números"): scrolls to the card on the same screen, puts the focus on it and lights it with the DS focus ring
 * for 1,5 s. Nothing navigates: there is nothing to approve in another screen (Muse, P1-08).
 */

export const SPOTLIGHT_MS = 1500

const quoted = (value: string): string => `"${value.split('\\').join('\\\\').split('"').join('\\"')}"`

/**
 * @param id - The indicator id (`data-indicator` of its card).
 * @param root - Where to look (the document, in the app).
 * @returns Whether the card was found.
 */
export function spotlightIndicator(id: string, root: ParentNode = document): boolean {
  const card = root.querySelector<HTMLElement>(`[data-indicator=${quoted(id)}]`)
  if (card === null) return false
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
  card.focus({ preventScroll: true })
  card.setAttribute('data-spotlight', 'true')
  window.setTimeout(() => { card.removeAttribute('data-spotlight') }, SPOTLIGHT_MS)
  return true
}

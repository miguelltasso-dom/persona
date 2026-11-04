/**
 * F6 / Shift+F6 between workspace areas (T3-UX-HARVEST §1, Muse; pattern from t3code docs/user/keyboard-focus.md, MIT).
 * Areas are elements marked `data-persona-area="<name>"` in DOM order (rail, conversa/painel, composer, gaveta).
 * Each area remembers its last focused control; arriving flashes a soft amber ring (no motion with reduced-motion).
 * Ctrl+F6 also works, because browsers may keep plain F6 for their toolbar.
 */

const AREA_SELECTOR = '[data-persona-area]'
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function visible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0
}

export function listAreas(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(AREA_SELECTOR)].filter(visible)
}

/** Install once (the rail is always mounted). Returns the uninstaller. */
export function installAreaNavigation(doc: Document = document): () => void {
  const last = new WeakMap<HTMLElement, HTMLElement>()

  const onFocusIn = (event: FocusEvent): void => {
    const target = event.target as HTMLElement | null
    const area = target?.closest<HTMLElement>(AREA_SELECTOR)
    if (area !== null && area !== undefined && target !== null) last.set(area, target)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'F6' || event.altKey) return
    const areas = listAreas(doc)
    if (areas.length === 0) return
    event.preventDefault()
    const active = doc.activeElement as HTMLElement | null
    // Deepest area containing focus (the composer lives inside the main panel).
    const current = areas.findLastIndex(area => active !== null && area.contains(active))
    const step = event.shiftKey ? -1 : 1
    const next = areas[(current + step + areas.length) % areas.length] ?? areas[0]
    if (next === undefined) return
    const remembered = last.get(next)
    const target = remembered !== undefined && next.contains(remembered) && visible(remembered)
      ? remembered
      : next.querySelector<HTMLElement>(FOCUSABLE) ?? next
    if (target === next && !next.hasAttribute('tabindex')) next.setAttribute('tabindex', '-1')
    target.focus()
    next.setAttribute('data-persona-area-flash', '')
    setTimeout(() => { next.removeAttribute('data-persona-area-flash') }, 650)
  }

  doc.addEventListener('focusin', onFocusIn)
  doc.addEventListener('keydown', onKeyDown)
  return () => {
    doc.removeEventListener('focusin', onFocusIn)
    doc.removeEventListener('keydown', onKeyDown)
  }
}

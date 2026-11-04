/**
 * List motion shared by Visão geral and Aprovações (DECISIONS-SPEC Regra 2):
 * - siblings rise with a 220 ms FLIP when a decided card leaves (reduced motion: no travel);
 * - focus never drops to <body>: it goes to the next card of the same list, or to the section title when the list empties.
 * Cards carry `data-decision-id`; the container may be any element wrapping them.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

export const DECISION_FLIP_MS = 220
const SPRING = 'cubic-bezier(0.34, 1.2, 0.64, 1)'

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function cards(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-decision-id]')]
}

function firstFocusable(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
}

/**
 * @param containerRef - element that contains the cards.
 * @param ids - ordered decision ids currently rendered (changes when a card enters or leaves).
 * @param fallbackRef - element (tabIndex -1) that receives focus when the list becomes empty.
 */
export function useDecisionListMotion(
  containerRef: RefObject<HTMLElement | null>,
  ids: readonly string[],
  fallbackRef?: RefObject<HTMLElement | null>,
): void {
  const key = ids.join('|')
  const prevRects = useRef(new Map<string, DOMRect>())
  const lastFocus = useRef<{ readonly id: string; readonly index: number } | null>(null)
  const prevIds = useRef<readonly string[]>(ids)

  // Remember which card holds focus (the node disappears with the card, so it must be tracked before).
  useEffect(() => {
    const container = containerRef.current
    if (container === null) return undefined
    const onFocusIn = (event: FocusEvent): void => {
      const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-decision-id]')
      const id = card?.dataset.decisionId
      if (card === null || card === undefined || id === undefined) return
      lastFocus.current = { id, index: cards(container).indexOf(card) }
    }
    container.addEventListener('focusin', onFocusIn)
    return () => { container.removeEventListener('focusin', onFocusIn) }
  }, [containerRef])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (container === null) {
      prevRects.current = new Map()
      prevIds.current = ids
      return
    }
    const reduced = prefersReducedMotion()
    const next = new Map<string, DOMRect>()
    for (const node of cards(container)) {
      const id = node.dataset.decisionId
      if (id === undefined) continue
      const rect = node.getBoundingClientRect()
      next.set(id, rect)
      const prev = prevRects.current.get(id)
      if (prev === undefined || reduced || typeof node.animate !== 'function') continue
      const dy = prev.top - rect.top
      if (dy === 0) continue
      node.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration: DECISION_FLIP_MS, easing: SPRING, fill: 'both' },
      )
    }
    prevRects.current = next

    // Focus: the focused card left the list → next card of the same list, else the section title.
    const held = lastFocus.current
    const before = prevIds.current
    prevIds.current = ids
    if (held === null || !before.includes(held.id) || ids.includes(held.id)) return
    const active: Element | null = document.activeElement
    if (active instanceof Node && active !== document.body && container.contains(active)) return
    const remaining = cards(container)
    const target = remaining[Math.min(held.index, remaining.length - 1)]
    const focusable = target === undefined ? null : firstFocusable(target)
    lastFocus.current = null
    if (focusable !== null) focusable.focus({ preventScroll: false })
    else fallbackRef?.current?.focus()
    // `key` is the cheap identity of the rendered ids
  }, [containerRef, fallbackRef, key])
}

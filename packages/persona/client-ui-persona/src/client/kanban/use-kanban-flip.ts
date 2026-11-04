/**
 * FLIP animation when cards change columns (UX-GUIDE §3).
 * - Human moves: 220 ms spring (`--motion-base`).
 * - Persona moves (`isCarried`): 360 ms, so the mini-avatar visibly "carries" the card to the new column.
 * - Reduced motion: no travel; the moved card fades in over 100 ms instead of jumping.
 */

import { useLayoutEffect, useRef, type RefObject } from 'react'

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
export const KANBAN_FLIP_MS = 220
export const KANBAN_CARRY_FLIP_MS = 360
const REDUCED_FADE_MS = 100
const SPRING = 'cubic-bezier(0.34, 1.2, 0.64, 1)'
const CARRY_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false
  return matchMedia(REDUCED_QUERY).matches
}

/**
 * Animates kanban cards after column moves using FLIP.
 * @param boardRef - element containing `[data-persona-kanban-card]` nodes.
 * @param cardsKey - changes when card positions may have moved.
 * @param isCarried - optional: true when a persona (not the human) moved the card.
 */
export function useKanbanFlip(
  boardRef: RefObject<HTMLElement | null>,
  cardsKey: string,
  isCarried?: (cardId: string) => boolean,
): void {
  const prevRects = useRef(new Map<string, DOMRect>())

  useLayoutEffect(() => {
    const board = boardRef.current
    if (board === null) {
      prevRects.current = new Map()
      return
    }
    const reduced = prefersReducedMotion()

    const nextRects = new Map<string, DOMRect>()
    const nodes = board.querySelectorAll('[data-persona-kanban-card]')
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      const id = node.dataset.personaKanbanCard
      if (id === undefined || id.length === 0) continue
      const rect = node.getBoundingClientRect()
      nextRects.set(id, rect)
      const prev = prevRects.current.get(id)
      if (prev === undefined || typeof node.animate !== 'function') continue
      const dx = prev.left - rect.left
      const dy = prev.top - rect.top
      if (dx === 0 && dy === 0) continue
      if (reduced) {
        node.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: REDUCED_FADE_MS, easing: 'linear' })
        continue
      }
      const carried = isCarried?.(id) === true
      node.animate(
        carried
          ? [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 6}px) rotate(-1deg)`, offset: 0.5 },
            { transform: 'translate(0, 0)' },
          ]
          : [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0, 0)' },
          ],
        { duration: carried ? KANBAN_CARRY_FLIP_MS : KANBAN_FLIP_MS, easing: carried ? CARRY_EASE : SPRING, fill: 'both' },
      )
    }
    prevRects.current = nextRects
    // isCarried reads a ref; only position changes should re-measure
  }, [boardRef, cardsKey])
}

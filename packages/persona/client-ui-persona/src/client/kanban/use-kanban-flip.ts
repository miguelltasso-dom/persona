/** FLIP animation when cards change columns (respects reduced motion). */

import { useLayoutEffect, useRef, type RefObject } from 'react'

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== 'function') return false
  return matchMedia(REDUCED_QUERY).matches
}

/**
 * Animates kanban cards after column moves using FLIP.
 * @param boardRef - element containing `[data-persona-kanban-card]` nodes.
 * @param cardsKey - changes when card positions may have moved.
 */
export function useKanbanFlip(boardRef: RefObject<HTMLElement | null>, cardsKey: string): void {
  const prevRects = useRef(new Map<string, DOMRect>())

  useLayoutEffect(() => {
    const board = boardRef.current
    if (board === null || prefersReducedMotion()) {
      prevRects.current = new Map()
      return
    }

    const nextRects = new Map<string, DOMRect>()
    const nodes = board.querySelectorAll('[data-persona-kanban-card]')
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue
      const id = node.dataset.personaKanbanCard
      if (id === undefined || id.length === 0) continue
      const rect = node.getBoundingClientRect()
      nextRects.set(id, rect)
      const prev = prevRects.current.get(id)
      if (prev !== undefined) {
        const dx = prev.left - rect.left
        const dy = prev.top - rect.top
        if (dx !== 0 || dy !== 0) {
          node.animate(
            [
              { transform: `translate(${dx}px, ${dy}px)` },
              { transform: 'translate(0, 0)' },
            ],
            { duration: 220, easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)', fill: 'both' },
          )
        }
      }
    }
    prevRects.current = nextRects
  }, [boardRef, cardsKey])
}

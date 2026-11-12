import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * The compact team bar (DESIGN-01-MUSE §1 cena 02 / §5.2 #01): the big "Sua equipe neste canal" strip folds into a 56 px bar when the
 * PERSON scrolls the thread down, and unfolds when she scrolls back to the top or presses "Mostrar a equipe". The trigger is the
 * scroll position, never the number of messages, and a new message never unfolds it (a new message only scrolls to the bottom).
 */

/** Height of the compact bar, in px. */
export const COMPACT_BAR_HEIGHT = 56

/**
 * Has the big strip scrolled up out of the viewport (so the compact bar takes its place)?
 *
 * @param stripBottom Distance from the top of the scroll area to the bottom edge of the big strip, in px (negative once it left).
 * @returns `true` once less than a bar's height of the strip is still in view.
 */
export function isStageScrolledAway(stripBottom: number): boolean {
  return stripBottom <= COMPACT_BAR_HEIGHT
}

/** What the thread scrolls to when the person presses "Mostrar a equipe": the very top, with no animation when motion is reduced. */
export function showStageBehavior(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? 'auto' : 'smooth'
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Tracks whether the compact bar is showing. The state only flips from a scroll of the thread (a passive listener that sets state when
 * the answer changes), so nothing runs per frame and nothing runs when messages arrive.
 *
 * @param scrollRef The scrolling thread region.
 * @param stripRef The big strip's wrapper, which scrolls with the thread.
 * @param enabled `false` when there is no team to show: the bar never shows.
 * @returns `collapsed` (the bar is showing) and `showStage` (scrolls back to the top, where the big strip is).
 */
export function useStageCollapsed(
  scrollRef: RefObject<HTMLElement>,
  stripRef: RefObject<HTMLElement>,
  enabled: boolean,
): { readonly collapsed: boolean; readonly showStage: () => void } {
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller === null || !enabled) {
      setCollapsed(false)
      return undefined
    }
    const onScroll = (): void => {
      const strip = stripRef.current
      if (strip === null) return
      const stripBottom = strip.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top
      setCollapsed(isStageScrolledAway(stripBottom))
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => { scroller.removeEventListener('scroll', onScroll) }
  }, [scrollRef, stripRef, enabled])
  const showStage = useCallback((): void => {
    scrollRef.current?.scrollTo({ top: 0, behavior: showStageBehavior(prefersReducedMotion()) })
  }, [scrollRef])
  return { collapsed: enabled && collapsed, showStage }
}

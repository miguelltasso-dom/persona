/**
 * Sliding "active" indicator geometry that stays glued to its target (Muse). Measuring once in a layout effect
 * goes stale whenever layout moves afterwards — embedded fonts finishing, a rail group opening with a transition,
 * the team row filling in, the rail collapsing — which left the active pill blank and misplaced (dogfood 05).
 * This hook re-measures on: deps change, any size change of the container or its children, transitions ending
 * inside it, and font loading.
 */

import { useCallback, useEffect, useLayoutEffect, useState, type DependencyList, type RefObject } from 'react'

export interface ActiveIndicatorBox {
  /** Offset along the axis inside the container's scroll box. */
  readonly offset: number
  readonly size: number
  readonly visible: boolean
}

const HIDDEN: ActiveIndicatorBox = { offset: 0, size: 0, visible: false }

export function useActiveIndicator(
  rootRef: RefObject<HTMLElement | null>,
  selector: string,
  axis: 'x' | 'y',
  deps: DependencyList,
): ActiveIndicatorBox {
  const [box, setBox] = useState<ActiveIndicatorBox>(HIDDEN)

  const measure = useCallback((): void => {
    const root = rootRef.current
    if (root === null) return
    const active = root.querySelector(selector)
    let next = HIDDEN
    if (active instanceof HTMLElement) {
      const rootRect = root.getBoundingClientRect()
      const rect = active.getBoundingClientRect()
      next = axis === 'y'
        ? { offset: rect.top - rootRect.top - root.clientTop + root.scrollTop, size: rect.height, visible: rect.height > 0 }
        : { offset: rect.left - rootRect.left - root.clientLeft + root.scrollLeft, size: rect.width, visible: rect.width > 0 }
    }
    setBox(previous => (
      previous.offset === next.offset && previous.size === next.size && previous.visible === next.visible ? previous : next
    ))
  }, [rootRef, selector, axis])

  useLayoutEffect(measure, [measure, ...deps])

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return undefined
    let frame = 0
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    if (resize !== null) {
      resize.observe(root)
      for (const child of root.children) resize.observe(child)
    }
    // Children added later (a group's items, the team row) are observed too.
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node instanceof Element) resize?.observe(node)
      }
      schedule()
    })
    mutations?.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current', 'aria-selected', 'aria-expanded'] })
    root.addEventListener('transitionend', schedule)
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    fonts?.addEventListener('loadingdone', schedule)
    void fonts?.ready.then(schedule)
    return () => {
      cancelAnimationFrame(frame)
      resize?.disconnect()
      mutations?.disconnect()
      root.removeEventListener('transitionend', schedule)
      fonts?.removeEventListener('loadingdone', schedule)
    }
  }, [rootRef, measure])

  return box
}

import { useLayoutEffect, useState } from 'react'

/** The window rectangle of the shell's main area, as CSS insets (what is left of the window around it). */
export interface MainBox {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

const MAIN = '[data-persona-area="main"]'

/**
 * Where the shell's `main` is right now. The teach screens live over THAT area (the rail and the bars stay visible, with a way back),
 * not over the whole window. `null` = no main on the page (or it has no size, as in a bare test): then the whole window is used.
 */
export function useMainBox(): MainBox | null {
  const [box, setBox] = useState<MainBox | null>(null)
  useLayoutEffect(() => {
    const measure = (): void => {
      const main = document.querySelector(MAIN)
      if (!(main instanceof HTMLElement)) { setBox(null); return }
      const rect = main.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) { setBox(null); return }
      const next = { top: rect.top, right: window.innerWidth - rect.right, bottom: window.innerHeight - rect.bottom, left: rect.left }
      setBox(current => (current !== null && current.top === next.top && current.right === next.right && current.bottom === next.bottom && current.left === next.left ? current : next))
    }
    measure()
    const main = document.querySelector(MAIN)
    const observer = typeof ResizeObserver === 'undefined' || !(main instanceof HTMLElement) ? undefined : new ResizeObserver(measure)
    if (observer !== undefined && main instanceof HTMLElement) observer.observe(main)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])
  return box
}

/** Inline style that puts a fixed element exactly over the main area (nothing when there is no main to measure). */
export function mainBoxStyle(box: MainBox | null): { readonly inset: string } | undefined {
  return box === null ? undefined : { inset: `${String(box.top)}px ${String(box.right)}px ${String(box.bottom)}px ${String(box.left)}px` }
}

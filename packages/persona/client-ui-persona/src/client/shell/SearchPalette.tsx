/**
 * Ctrl K as a modal over the CURRENT screen (DESIGN-01-MUSE §5.2 #11; Carbon #11): the screen underneath stays mounted, a solid scrim dims it, the
 * palette sits 14 vh from the top (640 px wide, at most 460 px tall), enters in 150 ms and leaves in 110 ms (a hard cut with reduced motion).
 * Esc, a click on the scrim, or choosing a result closes it, and the focus goes back to where it was.
 *
 * The palette only draws the frame; what is inside is the search view, which reads {@link useSearchPalette} to know it is in a palette (no page
 * header, results close the palette, the 1–9 shortcuts exist only here).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import styles from './SearchPalette.module.css'

/** How long the palette takes to leave (matches `--motion-exit` of the CSS). */
export const PALETTE_EXIT_MS = 110

export interface SearchPaletteApi {
  /** Closes the palette. Safe to call twice. */
  readonly close: () => void
}

const SearchPaletteContext = createContext<SearchPaletteApi | null>(null)

/** `null` when the search view is a page; the palette API when it lives inside the Ctrl K modal. */
export function useSearchPalette(): SearchPaletteApi | null {
  return useContext(SearchPaletteContext)
}

export interface SearchPaletteProps {
  readonly open: boolean
  readonly onClose: () => void
  /** The accessible name of the dialog. */
  readonly label: string
  readonly children: ReactNode
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * The modal frame of the Ctrl K palette.
 *
 * @param props `open` drives it from the shell state; `onClose` reports Esc and scrim clicks back to it.
 * @returns The scrim and dialog while open (and for the 110 ms exit), otherwise nothing.
 */
export function SearchPalette({ open, onClose, label, children }: SearchPaletteProps): ReactNode {
  // `mounted` outlives `open` by the exit animation, so the palette can fade out instead of vanishing.
  const [mounted, setMounted] = useState(open)
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  // While the palette leaves, the content stays as it was (the parent has already stopped rendering it), so the exit fades the real thing.
  const shown = useRef(children)
  if (open) shown.current = children

  useEffect(() => {
    if (open) {
      setMounted(true)
      return undefined
    }
    if (!mounted) return undefined
    if (prefersReducedMotion()) {
      setMounted(false)
      return undefined
    }
    const timer = setTimeout(() => { setMounted(false) }, PALETTE_EXIT_MS)
    return () => { clearTimeout(timer) }
  }, [open, mounted])

  // The focus goes back to where it was, unless the choice moved it somewhere on purpose (an editor, a dialog that just opened).
  useEffect(() => {
    if (!open) return undefined
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const target = returnFocus.current
      returnFocus.current = null
      const active = document.activeElement
      const stillHere = active === null || active === document.body || dialogRef.current?.contains(active) === true
      if (stillHere && target !== null && document.contains(target)) target.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => { document.removeEventListener('keydown', onKeyDown, true) }
  }, [open, onClose])

  const api = useMemo<SearchPaletteApi>(() => ({ close: onClose }), [onClose])

  const onDialogKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return
    // Document order (a selector list is not guaranteed to come back in it): the first and last tab stops are the ends of the cycle.
    const items = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }, [])

  if (!mounted) return null
  return (
    <div
      className={styles.backdrop}
      data-persona-search-palette=""
      data-closing={open ? undefined : ''}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onKeyDown={onDialogKeyDown}
      >
        <SearchPaletteContext.Provider value={api}>{shown.current}</SearchPaletteContext.Provider>
      </div>
    </div>
  )
}

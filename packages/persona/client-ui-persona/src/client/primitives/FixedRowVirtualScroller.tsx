/**
 * Fixed-height row windowing (OrgMap list pattern) for large Lumen lists.
 * Use when row height is stable enough for scroll math; overscan keeps drag/focus smooth.
 */

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import styles from './FixedRowVirtualScroller.module.css'

const DEFAULT_OVERSCAN = 8

export interface FixedRowVirtualScrollerProps {
  readonly rowCount: number
  readonly rowHeight: number
  readonly overscan?: number
  readonly className?: string | undefined
  readonly ariaLabel?: string | undefined
  /** A raiz é `role="list"`: use quando cada linha é um `listitem` (sem isso, o axe reprova as linhas sem lista-pai). */
  readonly listRole?: boolean | undefined
  readonly getRowKey: (index: number) => string
  readonly renderRow: (index: number) => ReactNode
}

/** Renders only visible fixed-height rows plus overscan. */
export function FixedRowVirtualScroller({
  rowCount,
  rowHeight,
  overscan = DEFAULT_OVERSCAN,
  className,
  ariaLabel,
  listRole = false,
  getRowKey,
  renderRow,
}: FixedRowVirtualScrollerProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(420)

  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return undefined
    setHeight(el.clientHeight || 420)
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => { setHeight(el.clientHeight || 420) })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [])

  const { first, last } = useMemo(() => {
    if (rowCount === 0) return { first: 0, last: 0 }
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan)
    const end = Math.min(rowCount, Math.ceil((scrollTop + height) / rowHeight) + overscan)
    return { first: start, last: end }
  }, [scrollTop, height, rowHeight, rowCount, overscan])

  const merged = [styles.root, className ?? ''].filter(Boolean).join(' ')

  return (
    <div
      ref={ref}
      className={merged}
      role={listRole ? 'list' : undefined}
      tabIndex={0}
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
      onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop) }}
    >
      <div className={styles.inner} style={{ height: rowCount * rowHeight }}>
        {Array.from({ length: last - first }, (_, offset) => {
          const index = first + offset
          const style: CSSProperties = { top: index * rowHeight, height: rowHeight }
          return (
            <div key={getRowKey(index)} className={styles.row} style={style}>
              {renderRow(index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

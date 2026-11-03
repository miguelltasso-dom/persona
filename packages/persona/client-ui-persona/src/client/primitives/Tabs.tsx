import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Tabs.module.css'

export interface TabItem<T extends string> {
  readonly id: T
  readonly label: ReactNode
  /** Optional count badge. */
  readonly count?: number
}

export interface TabsProps<T extends string> {
  readonly items: readonly TabItem<T>[]
  readonly value: T
  readonly onChange: (id: T) => void
  /** Accessible name of the tablist. */
  readonly label: string
  /** id prefix used for aria-controls (`${idPrefix}-panel-${id}`). */
  readonly idPrefix: string
}

/** Segmented tabs: sunken track, active tab is an outlined sticker; sliding indicator; arrow keys. */
export function Tabs<T extends string>({ items, value, onChange, label, idPrefix }: TabsProps<T>): ReactNode {
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })

  useLayoutEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (active === null || active === undefined) return
    setIndicator({ left: active.offsetLeft, width: active.offsetWidth, ready: true })
  }, [value, items])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const index = items.findIndex(item => item.id === value)
    const last = items.length - 1
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowRight'
          ? (index >= last ? 0 : index + 1)
          : (index <= 0 ? last : index - 1)
    const target = items[next]
    if (target === undefined) return
    onChange(target.id)
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${target.id}"]`)?.focus()
  }

  return (
    <div className={styles.track} role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
      <span
        className={styles.indicator}
        style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width, opacity: indicator.ready ? 1 : 0 }}
        aria-hidden="true"
      />
      {items.map((item) => {
        const selected = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            data-tab-id={item.id}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => { onChange(item.id) }}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

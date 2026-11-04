import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useActiveIndicator } from './use-active-indicator.ts'
import styles from './Tabs.module.css'

export interface TabItem<T extends string> {
  readonly id: T
  readonly label: ReactNode
  /** Optional count badge. */
  readonly count?: number
  /** Not selectable yet (e.g. host capability missing); stays visible with aria-disabled. */
  readonly disabled?: boolean
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
  const indicator = useActiveIndicator(listRef, '[aria-selected="true"]', 'x', [value, items])
  // aria-controls only when the screen really renders the tabpanel (axe aria-valid-attr-value: the id must exist).
  const panelId = `${idPrefix}-panel-${value}`
  const [panelExists, setPanelExists] = useState(false)
  useLayoutEffect(() => {
    setPanelExists(typeof document !== 'undefined' && document.getElementById(panelId) !== null)
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const enabled = items.filter(item => item.disabled !== true)
    const index = enabled.findIndex(item => item.id === value)
    const last = enabled.length - 1
    const next = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowRight'
          ? (index >= last ? 0 : index + 1)
          : (index <= 0 ? last : index - 1)
    const target = enabled[next]
    if (target === undefined) return
    onChange(target.id)
    listRef.current?.querySelector<HTMLElement>(`[data-tab-id="${target.id}"]`)?.focus()
  }

  return (
    <div className={styles.track} role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
      <span
        className={styles.indicator}
        style={{ transform: `translateX(${indicator.offset}px)`, width: indicator.size, opacity: indicator.visible ? 1 : 0 }}
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
            aria-controls={selected && panelExists ? panelId : undefined}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            disabled={item.disabled === true}
            aria-disabled={item.disabled === true || undefined}
            onClick={() => { if (item.disabled !== true) onChange(item.id) }}
          >
            {item.label}
            {item.count !== undefined && <span className={styles.count}>{item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A row of light filter chips (DESIGN-01 Muse cena 04+05: "um só trilho de filtros; o de baixo vira chips leves, não o mesmo trilho afundado").
 * The sunken rail of `Tabs` is for places and screens; a filter of a list is a group of toggle buttons (`aria-pressed`), exactly one pressed.
 */

import type { ReactNode } from 'react'
import styles from './FilterChips.module.css'

export interface FilterChipItem<Id extends string> {
  readonly id: Id
  readonly label: string
  /** A count shown after the label ("Clientes 2"). Absent = no number. */
  readonly count?: number | undefined
}

export interface FilterChipsProps<Id extends string> {
  /** Accessible name of the group ("Filtrar projetos"). */
  readonly label: string
  readonly items: readonly FilterChipItem<Id>[]
  readonly value: Id
  readonly onChange: (id: Id) => void
  readonly className?: string | undefined
}

export function FilterChips<Id extends string>({ label, items, value, onChange, className }: FilterChipsProps<Id>): ReactNode {
  return (
    <div className={className === undefined ? styles.group : `${styles.group} ${className}`} role="group" aria-label={label}>
      {items.map(item => (
        <button key={item.id} type="button" className={styles.chip} aria-pressed={item.id === value} onClick={() => { onChange(item.id) }}>
          {item.label}
          {item.count !== undefined && (
            <>
              {' '}
              <span className={styles.count}>{item.count}</span>
            </>
          )}
        </button>
      ))}
    </div>
  )
}

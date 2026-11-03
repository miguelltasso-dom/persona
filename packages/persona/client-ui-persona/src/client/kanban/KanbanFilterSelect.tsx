/** Kanban filters: custom chevron select + sticky stage chips. */
import type { ReactNode, SelectHTMLAttributes } from 'react'
import { UiIcon } from '../primitives/index.ts'
import styles from './KanbanFilterSelect.module.css'

export interface KanbanFilterSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: ReactNode
}

export function KanbanFilterSelect({ label, id, className, children, ...rest }: KanbanFilterSelectProps): ReactNode {
  const controlClass = className === undefined ? styles.control : `${styles.control} ${className}`
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <div className={styles.controlWrap}>
        <select id={id} className={controlClass} {...rest}>{children}</select>
        <span className={styles.chevron} aria-hidden="true">
          <UiIcon name="chevronDown" size={18} strokeWidth={2.2} />
        </span>
      </div>
    </div>
  )
}

export interface KanbanStageFilterProps {
  readonly label: ReactNode
  readonly allLabel: ReactNode
  readonly value: string
  readonly options: readonly { readonly id: string; readonly label: string }[]
  readonly onChange: (columnId: string) => void
}

export function KanbanStageFilter({ label, allLabel, value, options, onChange }: KanbanStageFilterProps): ReactNode {
  return (
    <div className={styles.stageRow} role="group" aria-label={typeof label === 'string' ? label : undefined}>
      <span className={styles.stageLabel}>{label}</span>
      <div className={styles.stageChips}>
        <button
          type="button"
          className={styles.stageChip}
          aria-pressed={value === 'all'}
          onClick={() => { onChange('all') }}
        >
          {allLabel}
        </button>
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            className={styles.stageChip}
            aria-pressed={value === option.id}
            onClick={() => { onChange(option.id) }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

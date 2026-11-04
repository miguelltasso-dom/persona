/**
 * ChoiceCards (Muse): an explicit choice as radio cards — icon, title, one plain sentence, optional badge
 * ("Recomendado"). Real radio inputs (keyboard + screen reader); the card is their visual. Used by the account
 * swap policy (WAVE2 c) and by Regras presets (UX-05).
 */

import type { ReactNode } from 'react'
import styles from './ChoiceCards.module.css'

export interface ChoiceCardOption<T extends string> {
  readonly id: T
  readonly title: string
  readonly body: string
  readonly icon?: ReactNode
  /** "Recomendado" */
  readonly badge?: string | undefined
}

export interface ChoiceCardsProps<T extends string> {
  /** Fieldset legend (visible). */
  readonly legend: string
  /** Radio group name (unique on the page). */
  readonly name: string
  readonly options: readonly ChoiceCardOption<T>[]
  readonly value: T | undefined
  readonly onChange: (id: T) => void
  readonly disabled?: boolean
  /** Visually hide the legend when a card title above already says it. */
  readonly hideLegend?: boolean
}

export function ChoiceCards<T extends string>({ legend, name, options, value, onChange, disabled = false, hideLegend = false }: ChoiceCardsProps<T>): ReactNode {
  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={hideLegend ? 'persona-sr-only' : styles.legend}>{legend}</legend>
      <div className={styles.grid} data-count={options.length}>
        {options.map(option => (
          <label key={option.id} className={styles.card} data-checked={value === option.id ? '' : undefined}>
            <input
              type="radio"
              className={styles.radio}
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => { onChange(option.id) }}
            />
            {option.icon !== undefined && <span className={styles.icon} aria-hidden="true">{option.icon}</span>}
            <span className={styles.text}>
              <span className={styles.title}>
                {option.title}
                {option.badge !== undefined && <span className={styles.badge}>{option.badge}</span>}
              </span>
              <span className={styles.body}>{option.body}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

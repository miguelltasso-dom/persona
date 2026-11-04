/**
 * Switch (Muse): the one on/off control of the app (Gestor, Ensinar › microfone, editor). A real `role="switch"`
 * button; the track uses `--persona-outline-control` so it keeps ≥ 3:1 against cards in BOTH themes
 * (the plain outline token is near-black in dark and made the off state vanish).
 */

import type { ReactNode } from 'react'
import styles from './Switch.module.css'

export interface SwitchProps {
  readonly checked: boolean
  readonly onChange: (next: boolean) => void
  /** Accessible name when there is no visible label to point at. */
  readonly label?: string | undefined
  /** id of the visible label (preferred). */
  readonly labelledBy?: string | undefined
  readonly describedBy?: string | undefined
  readonly disabled?: boolean | undefined
  readonly id?: string | undefined
}

export function Switch({ checked, onChange, label, labelledBy, describedBy, disabled = false, id }: SwitchProps): ReactNode {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy === undefined ? label : undefined}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      className={styles.switch}
      onClick={() => { onChange(!checked) }}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  )
}

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import styles from './Chip.module.css'

export type ChipTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'plain'

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: ChipTone
  readonly icon?: ReactNode
  readonly size?: 's' | 'm'
}

/** Outlined pill label / badge (status, counts, tags). */
export function Chip({ tone = 'neutral', icon, size = 'm', className, children, ...rest }: ChipProps): ReactNode {
  const merged = [styles.chip, styles[tone], size === 's' ? styles.small : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <span className={merged} {...rest}>
      {icon !== undefined && <span className={styles.icon}>{icon}</span>}
      {children}
    </span>
  )
}

export interface ReactionChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly emoji: string
  readonly count: number
  /** Current user already reacted. */
  readonly selected?: boolean
  /** Accessible description, e.g. "3 reações 👍". */
  readonly label: string
}

/** Reaction pill: emoji + tabular count; toggles aria-pressed. */
export function ReactionChip({ emoji, count, selected = false, label, className, ...rest }: ReactionChipProps): ReactNode {
  const merged = className === undefined ? styles.reaction : `${styles.reaction} ${className}`
  return (
    <button type="button" className={merged} aria-pressed={selected} aria-label={label} {...rest}>
      <span className={styles.emoji} aria-hidden="true">{emoji}</span>
      <span className={styles.count} aria-hidden="true">{count}</span>
    </button>
  )
}

/** EmptyState, Skeleton and DayDivider (DESIGN-SYSTEM §5). */

import type { CSSProperties, ReactNode } from 'react'
import { PawTrail } from './accents.tsx'
import styles from './Feedback.module.css'

export interface EmptyStateProps {
  /** Illustration URL (Brush art or persona pose). */
  readonly illustration?: string | undefined
  /** Custom illustration node (overrides `illustration`). */
  readonly art?: ReactNode
  readonly title: ReactNode
  readonly body?: ReactNode
  /** Exactly one primary action (RCD: never ship a blank dashboard). */
  readonly action?: ReactNode
  readonly secondaryAction?: ReactNode
  readonly compact?: boolean
}

/** Illustrated empty state: art + title + one line + one primary action. */
export function EmptyState({ illustration, art, title, body, action, secondaryAction, compact = false }: EmptyStateProps): ReactNode {
  return (
    <div className={compact ? `${styles.empty} ${styles.compact}` : styles.empty}>
      <div className={styles.art} aria-hidden="true">
        {art ?? (illustration !== undefined ? <img src={illustration} alt="" /> : <PawTrail />)}
      </div>
      <h3 className={styles.emptyTitle}>{title}</h3>
      {body !== undefined && <p className={styles.emptyBody}>{body}</p>}
      {(action !== undefined || secondaryAction !== undefined) && (
        <div className={styles.emptyActions}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}

export interface SkeletonProps {
  readonly width?: number | string
  readonly height?: number | string
  readonly shape?: 'text' | 'block' | 'circle'
  readonly className?: string | undefined
}

/** Sunken shimmer placeholder (no spinner). */
export function Skeleton({ width = '100%', height = 14, shape = 'text', className }: SkeletonProps): ReactNode {
  const style: CSSProperties = { width, height }
  const merged = [styles.skeleton, styles[shape], className ?? ''].filter(Boolean).join(' ')
  return <span className={merged} style={style} aria-hidden="true" />
}

/** Day separator: hairline + outlined pill ("Hoje"). */
export function DayDivider({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div className={styles.day} role="separator" aria-label={typeof children === 'string' ? children : undefined}>
      <span className={styles.dayPill}>{children}</span>
    </div>
  )
}

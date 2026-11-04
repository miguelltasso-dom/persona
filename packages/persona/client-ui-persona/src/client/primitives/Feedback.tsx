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
  /** Heading level of the title (default h3; a full-dialog empty state uses h1). */
  readonly titleAs?: 'h1' | 'h2' | 'h3'
  /** `id` of the title (a dialog's `aria-labelledby` target). */
  readonly titleId?: string
  /** Max size in px of the illustration (default per variant; Muse: 240 for "Falta uma IA"). */
  readonly artSize?: number
}

/** Illustrated empty state: art + title + one line + one primary action. */
export function EmptyState({ illustration, art, title, body, action, secondaryAction, compact = false, titleAs: Title = 'h3', titleId, artSize }: EmptyStateProps): ReactNode {
  return (
    <div className={compact ? `${styles.empty} ${styles.compact}` : styles.empty}>
      <div className={styles.art} aria-hidden="true">
        {art ?? (illustration !== undefined ? <img src={illustration} alt="" {...(artSize === undefined ? {} : { style: { maxHeight: artSize, maxWidth: artSize } })} /> : <PawTrail />)}
      </div>
      <Title id={titleId} className={styles.emptyTitle}>{title}</Title>
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

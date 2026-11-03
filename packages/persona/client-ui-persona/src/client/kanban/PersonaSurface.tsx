/** Shared empty / loading / error panels for Lumen surfaces (RCD: Never ship a blank dashboard). */

import type { ReactNode } from 'react'
import { PersonaButton } from '../primitives/PersonaButton.tsx'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import styles from './Kanban.module.css'

export interface PersonaSurfaceProps {
  readonly dict: LocaleDict
  readonly illustrationLabelKey: string
  readonly titleKey: string
  readonly hintKey?: string
  readonly primaryKey?: string
  readonly onPrimary?: () => void
}

function PawIllustration({ label }: { label: string }): ReactNode {
  return (
    <svg
      width="120"
      height="80"
      viewBox="0 0 120 80"
      role="img"
      aria-label={label}
      className={styles.emptyIllustration}
    >
      <ellipse cx="60" cy="52" rx="36" ry="20" fill="var(--persona-lilac-200)" />
      <circle cx="42" cy="38" r="8" fill="var(--persona-lilac-400)" />
      <circle cx="60" cy="32" r="9" fill="var(--persona-lilac-500)" />
      <circle cx="78" cy="38" r="8" fill="var(--persona-lilac-400)" />
      <circle cx="50" cy="58" r="5" fill="var(--persona-active-accent)" />
      <circle cx="70" cy="58" r="5" fill="var(--persona-active-accent)" />
    </svg>
  )
}

/** Empty state with illustration + single primary action. */
export function PersonaSurfaceEmpty({
  dict,
  illustrationLabelKey,
  titleKey,
  hintKey,
  primaryKey,
  onPrimary,
}: PersonaSurfaceProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  return (
    <div className={styles.statePanel}>
      <PawIllustration label={t(illustrationLabelKey)} />
      <h2 className={styles.stateTitle}>{t(titleKey)}</h2>
      {hintKey !== undefined && <p className={styles.stateHint}>{t(hintKey)}</p>}
      {primaryKey !== undefined && (
        <PersonaButton onClick={() => onPrimary?.()}>{t(primaryKey)}</PersonaButton>
      )}
    </div>
  )
}

export interface PersonaSurfaceErrorProps {
  readonly dict: LocaleDict
  readonly titleKey: string
  readonly retryKey: string
  readonly onRetry: () => void
}

/** Error state with retry. */
export function PersonaSurfaceError({ dict, titleKey, retryKey, onRetry }: PersonaSurfaceErrorProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  return (
    <div className={styles.statePanel} role="alert">
      <h2 className={styles.stateTitle}>{t(titleKey)}</h2>
      <PersonaButton onClick={onRetry}>{t(retryKey)}</PersonaButton>
    </div>
  )
}

export interface PersonaSurfaceLoadingProps {
  readonly dict: LocaleDict
  readonly messageKey: string
  readonly skeletonColumns?: number
}

/** Loading skeleton (lilac shimmer in Kanban.module.css). */
export function PersonaSurfaceLoading({ dict, messageKey, skeletonColumns = 5 }: PersonaSurfaceLoadingProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  return (
    <div className={styles.statePanel} role="status" aria-busy="true">
      <p className={styles.stateHint}>{t(messageKey)}</p>
      <div className={styles.skeletonBoard} aria-hidden="true">
        {Array.from({ length: skeletonColumns }, (_, i) => (
          <div key={i} className={styles.skeletonColumn} />
        ))}
      </div>
    </div>
  )
}

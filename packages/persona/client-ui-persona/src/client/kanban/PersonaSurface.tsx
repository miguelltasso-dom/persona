/** Shared empty / loading / error for Lumen surfaces (RCD: never a blank dashboard). */

import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { houseEmptyArt } from '../decor/HouseDecor.tsx'
import { Button, EmptyState, ErrorState, Skeleton } from '../primitives/index.ts'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import styles from './Kanban.module.css'

export type LumenEmptyIllustration = 'empty-kanban' | 'empty-connections' | 'empty-sem-ia' | 'empty-vault' | 'empty-routines' | 'empty-inbox' | 'bibliotecario' | 'empty-historico' | 'empty-regras-da-casa'

export interface PersonaSurfaceProps {
  readonly dict: LocaleDict
  readonly illustrationKey?: LumenEmptyIllustration
  readonly titleKey: string
  readonly hintKey?: string
  readonly primaryKey?: string
  readonly onPrimary?: () => void
  /** Longest side of the art in px (EmptyState `artSize`). */
  readonly artSize?: number | undefined
  /** The same scene by day and by night (BR-P4): with `persona.flag.houseDecor` the dark theme shows the night one, in the same frame. */
  readonly nightPair?: { readonly day: string; readonly night: string }
}

/** Empty state with Brush illustration. */
export function PersonaSurfaceEmpty({
  dict,
  illustrationKey = 'empty-kanban',
  titleKey,
  hintKey,
  primaryKey,
  onPrimary,
  artSize,
  nightPair,
}: PersonaSurfaceProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const illustration = ILLUSTRATIONS[illustrationKey]
  return (
    <EmptyState
      illustration={illustration}
      {...(nightPair === undefined ? {} : { art: houseEmptyArt(nightPair.day, nightPair.night, artSize) })}
      {...(artSize === undefined ? {} : { artSize })}
      title={t(titleKey)}
      body={hintKey === undefined ? undefined : t(hintKey)}
      // No dead controls (DESIGN-SYSTEM §9): the CTA only exists when something will happen.
      action={primaryKey === undefined || onPrimary === undefined ? undefined : (
        <Button variant="primary" onClick={() => { onPrimary() }}>{t(primaryKey)}</Button>
      )}
    />
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
    <ErrorState
      title={t(titleKey)}
      retryLabel={t(retryKey)}
      onRetry={onRetry}
    />
  )
}

export interface PersonaSurfaceLoadingProps {
  readonly dict: LocaleDict
  readonly messageKey: string
  readonly skeletonColumns?: number
}

/** Kanban-shaped skeleton (no spinner). */
export function PersonaSurfaceLoading({ dict, messageKey, skeletonColumns = 5 }: PersonaSurfaceLoadingProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  return (
    <div className={styles.statePanel} role="status" aria-busy="true" aria-live="polite">
      <p className={styles.stateHint}>{t(messageKey)}</p>
      <div className={styles.skeletonBoard} aria-hidden="true">
        {Array.from({ length: skeletonColumns }, (_, i) => (
          <div key={i} className={styles.skeletonColumn}>
            <Skeleton height={18} width="70%" />
            <Skeleton height={72} shape="block" />
            <Skeleton height={72} shape="block" />
          </div>
        ))}
      </div>
    </div>
  )
}

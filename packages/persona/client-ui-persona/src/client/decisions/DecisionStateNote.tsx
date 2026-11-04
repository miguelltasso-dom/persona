/** What a card says about its own decision when it is not pending (shared by Visão geral and Aprovações). */

import type { ReactNode } from 'react'
import { Button, Chip } from '../primitives/index.ts'
import type { DecisionState, DecisionT } from './decision-types.ts'
import styles from './Decisions.module.css'

export interface DecisionStateNoteProps {
  readonly state: DecisionState | undefined
  readonly t: DecisionT
  /** "Tentar de novo": run the same decision again. */
  readonly onRetry?: (() => void) | undefined
}

/** `declined` → neutral chip; `failed` → one honest line plus retry. Other states render nothing. */
export function DecisionStateNote({ state, t, onRetry }: DecisionStateNoteProps): ReactNode {
  if (state === 'declined') {
    return <Chip size="s" tone="neutral">{t('decision.declined')}</Chip>
  }
  if (state === 'failed') {
    return (
      <div className={styles.failedRow} role="alert">
        <span className={styles.failedText}>{t('decision.failed')}</span>
        {onRetry !== undefined && (
          <Button size="s" variant="secondary" onClick={onRetry}>{t('decision.retry')}</Button>
        )}
      </div>
    )
  }
  return null
}

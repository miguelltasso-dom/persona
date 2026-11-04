/**
 * What "Aplicar na pasta" says while it works or when something is in the way (SIMPLE-WORKSPACE-SPEC §4).
 * Never a silent failure, never half applied: every state says what happened and offers the one next step.
 */

import type { ReactNode } from 'react'
import { Button, Notice } from '../../primitives/index.ts'
import type { ApplyPhase } from './draft-types.ts'
import styles from './ApplyNotice.module.css'

export interface ApplyNoticeProps {
  readonly phase: ApplyPhase
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string
  readonly onRetry?: (() => void) | undefined
}

export function ApplyNotice({ phase, t, onRetry }: ApplyNoticeProps): ReactNode {
  let body: ReactNode = null
  if (phase.kind === 'locked') {
    body = (
      <Notice tone="warning">
        <span className={styles.row}>
          <span>{t('apply.fileLocked', { file: phase.file })}</span>
          {onRetry !== undefined && <Button size="s" variant="secondary" onClick={onRetry}>{t('apply.retry')}</Button>}
        </span>
      </Notice>
    )
  } else if (phase.kind === 'downloading') {
    body = (
      <Notice tone="info">
        <span className={styles.row}>
          <span>{t('apply.onedrive', { file: phase.file })}</span>
          {phase.percent !== undefined && (
            <progress className={styles.progress} max={100} value={Math.max(0, Math.min(100, phase.percent))} aria-label={t('apply.onedrive', { file: phase.file })} />
          )}
        </span>
      </Notice>
    )
  } else if (phase.kind === 'failed') {
    body = (
      <Notice tone="warning">
        <span className={styles.column}>
          <span className={styles.row}>
            <span>{t('apply.failed')}</span>
            {onRetry !== undefined && <Button size="s" variant="secondary" onClick={onRetry}>{t('apply.retry')}</Button>}
          </span>
          {phase.detail !== undefined && phase.detail.trim() !== '' && (
            <details className={styles.details}>
              <summary>{t('apply.details')}</summary>
              <pre className={styles.detailText}>{phase.detail}</pre>
            </details>
          )}
        </span>
      </Notice>
    )
  } else if (phase.kind === 'applying') {
    body = <span className="persona-sr-only">{t('apply.applying')}</span>
  }
  return (
    <div className={styles.region} role="status" aria-live="polite" data-persona-review="apply-status" data-phase={phase.kind}>
      {body}
    </div>
  )
}

/**
 * After "Aplicar na pasta": the whole panel becomes the moment (REVIEW-APPROVALS-REDESIGN §1) — what happened, how many
 * files, that it can be undone (only when the host really kept the earlier versions), and the way back.
 */

import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../../assets/generated-imports.ts'
import { Button } from '../../primitives/index.ts'
import styles from './DraftReview.module.css'

export interface AppliedMomentProps {
  readonly count: number
  /** The earlier versions were kept: "Desfazer" exists. Never a false one. */
  readonly undoable: boolean
  readonly onUndo?: (() => void) | undefined
  readonly onBack: () => void
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string
}

/** BR-P3 art `sucesso-aplicado` when it has arrived; until then the paw trail the empty states already use. */
function successArt(): string | undefined {
  return (ILLUSTRATIONS as Readonly<Record<string, string>>)['sucesso-aplicado']
}

export function AppliedMoment({ count, undoable, onUndo, onBack, t }: AppliedMomentProps): ReactNode {
  const art = successArt()
  return (
    <section className={styles.done} role="status" aria-live="polite" data-persona-review="applied" data-testid="review-applied">
      {art !== undefined && <img className={styles.doneArt} src={art} alt="" width={240} height={240} decoding="async" />}
      <h2 className={styles.doneTitle}>{t('applied.title')}</h2>
      <p className={styles.doneBody}>
        {count === 1 ? t('applied.body.one') : t('applied.body.many', { count })}
        {undoable ? ` · ${t('applied.undoWindow')}` : ''}
      </p>
      <div className={styles.actions}>
        {undoable && onUndo !== undefined && <Button variant="secondary" data-testid="review-undo" onClick={onUndo}>{t('applied.undo')}</Button>}
        <Button variant="primary" data-testid="review-leave" onClick={onBack}>{t('applied.back')}</Button>
      </div>
    </section>
  )
}

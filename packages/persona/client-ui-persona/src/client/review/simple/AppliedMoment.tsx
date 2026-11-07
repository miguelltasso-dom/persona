/**
 * After "Aplicar na pasta": the whole panel becomes the moment (REVIEW-APPROVALS-REDESIGN §1) — what happened, how many
 * files, that it can be undone (only when the host really kept the earlier versions), and the way back.
 */

import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../../assets/generated-imports.ts'
import { Button } from '../../primitives/index.ts'
import styles from './DraftReview.module.css'

/** The pictures that were just applied (Atlas 07/11: the person sees the IMAGE, not only a file name): inline addresses, drawn only as `<img>`. */
export interface AppliedPicture {
  readonly name: string
  readonly src: string
}

/** At most this many thumbnails (the moment is a celebration, not a gallery). */
export const APPLIED_PICTURES_MAX = 3

export interface AppliedMomentProps {
  readonly count: number
  /** The earlier versions were kept: "Desfazer" exists. Never a false one. */
  readonly undoable: boolean
  readonly onUndo?: (() => void) | undefined
  readonly onBack: () => void
  readonly t: (key: string, params?: Readonly<Record<string, string | number>>) => string
  /** Thumbnails of the image files that were applied (already through `safeReviewImageSrc`); none = nothing drawn. Hidden on a short window. */
  readonly pictures?: readonly AppliedPicture[] | undefined
}

/** BR-P3 art `sucesso-aplicado` when it has arrived; until then the paw trail the empty states already use. */
function successArt(): string | undefined {
  return (ILLUSTRATIONS as Readonly<Record<string, string>>)['sucesso-aplicado']
}

export function AppliedMoment({ count, undoable, onUndo, onBack, t, pictures }: AppliedMomentProps): ReactNode {
  const art = successArt()
  const shown = (pictures ?? []).slice(0, APPLIED_PICTURES_MAX)
  return (
    <section className={styles.done} role="status" aria-live="polite" data-persona-review="applied" data-testid="review-applied">
      {art !== undefined && <img className={styles.doneArt} src={art} alt="" width={240} height={240} decoding="async" />}
      <h2 className={styles.doneTitle}>{t('applied.title')}</h2>
      <p className={styles.doneBody}>
        {count === 1 ? t('applied.body.one') : t('applied.body.many', { count })}
        {undoable ? ` · ${t('applied.undoWindow')}` : ''}
      </p>
      {shown.length > 0 && (
        <ul className={styles.donePictures} data-testid="review-applied-pictures">
          {shown.map(picture => (
            <li key={picture.name} className={styles.donePicture}>
              <img className={styles.donePictureImg} src={picture.src} alt={picture.name} />
            </li>
          ))}
        </ul>
      )}
      <div className={styles.actions}>
        {undoable && onUndo !== undefined && <Button variant="secondary" data-testid="review-undo" onClick={onUndo}>{t('applied.undo')}</Button>}
        <Button variant="primary" data-testid="review-leave" onClick={onBack}>{t('applied.back')}</Button>
      </div>
    </section>
  )
}

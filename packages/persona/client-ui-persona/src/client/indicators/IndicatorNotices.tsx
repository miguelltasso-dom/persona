/**
 * "Seus números" · the fall notices inside "Precisa de você" (P1-08, Muse 05:22). A fall is a NOTICE, not a decision: the line says
 * "Aviso · Seus números" and "Vendas de ontem caiu 31% desde ontem.", "Ver o número" lights the card on the same screen and "Já vi" takes the
 * notice off the list (the card keeps its amber border until the next refresh).
 */

import type { ReactNode } from 'react'
import { Button, UiIcon } from '../primitives/index.ts'
import type { IndicatorNoticeUi } from './indicators-model.ts'
import { itext } from './indicators-text.ts'
import styles from './IndicatorNotices.module.css'

export interface IndicatorNoticesProps {
  readonly notices: readonly IndicatorNoticeUi[]
  /** "Ver o número": the card of this indicator. */
  readonly onSee: (indicatorId: string) => void
  /** "Já vi". Absent = the host cannot take it: the button is not drawn. */
  readonly onDismiss?: ((indicatorId: string) => void) | undefined
}

export function IndicatorNotices({ notices, onSee, onDismiss }: IndicatorNoticesProps): ReactNode {
  if (notices.length === 0) return null
  return (
    <ul className={styles.list} role="list" aria-label={itext('notice.aria')} data-indicator-notices>
      {notices.map((notice) => {
        const titleId = `indicator-notice-${notice.id}`
        return (
          <li key={notice.id} className={styles.item} data-indicator-notice={notice.indicatorId}>
            <span className={styles.icon} aria-hidden="true"><UiIcon name="alert" size={18} strokeWidth={2} /></span>
            {/* The sentence and the buttons share one block: in a narrow window (200% zoom) the buttons go UNDER the sentence, never squeeze it to a letter wide. */}
            <span className={styles.body}>
              <span className={styles.text}>
                <span className={styles.kind}>{itext('notice.kind')}</span>
                <span id={titleId} className={styles.title}>{notice.title}</span>
              </span>
              <span className={styles.actions}>
                <Button size="s" variant="secondary" aria-describedby={titleId} onClick={() => { onSee(notice.indicatorId) }}>{itext('notice.see')}</Button>
                {onDismiss !== undefined && (
                  <Button size="s" variant="ghost" aria-describedby={titleId} onClick={() => { onDismiss(notice.indicatorId) }}>{itext('notice.seen')}</Button>
                )}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

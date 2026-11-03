/** Review delivery for tasks in Em revisão (ReviewDelivery contract). */
import { useState, type ReactNode } from 'react'
import { Button } from '../primitives/Button.tsx'
import { usePersonaMotion } from '../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { PersonaSurfaceEmpty, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import styles from './ReviewDeliveryPanel.module.css'
import type { ReviewBlockedUi, ReviewSummaryUi } from './mock-data.ts'
import { pt as defaultDict } from '../locale/review/locales.ts'

export type ReviewDeliverySurfaceState = 'loading' | 'empty' | 'ready'

export interface ReviewDeliveryPanelProps {
  readonly dict?: LocaleDict
  readonly taskTitle?: string
  readonly summary?: ReviewSummaryUi | null
  readonly blocked?: ReviewBlockedUi | null
  readonly initialState?: ReviewDeliverySurfaceState
  readonly onAccept?: () => void
  readonly onRequestChanges?: (feedback: string) => void
  readonly onDiscard?: () => void
}

/** One question per card; amber primary is Accept only. */
export function ReviewDeliveryPanel({
  dict = defaultDict,
  taskTitle = '',
  summary = null,
  blocked = null,
  initialState = 'ready',
  onAccept,
  onRequestChanges,
  onDiscard,
}: ReviewDeliveryPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [mode, setMode] = useState<'review' | 'feedback' | 'discard'>('review')
  const [feedback, setFeedback] = useState('')

  if (initialState === 'loading') {
    return <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={1} />
  }

  if (initialState === 'empty' || summary === null) {
    return (
      <PersonaSurfaceEmpty
        dict={dict}
        illustrationKey="empty-inbox"
        titleKey="empty.title"
        hintKey="empty.hint"
      />
    )
  }

  const isBlocked = blocked !== null && blocked !== undefined

  return (
    <div className={styles.shell} ref={motion.ref} style={motion.style} data-persona-surface="review-delivery">
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>
          {taskTitle === '' ? t('subtitle') : `${taskTitle} — ${t('subtitle')}`}
        </p>
      </header>

      <article className={styles.card} aria-labelledby="persona-review-question">
        {isBlocked && (
          <>
            <span className={styles.chipBlocked}>{t('blocked.chip')}</span>
            <h2 className={styles.sectionTitle}>{t('blocked.title')}</h2>
            <p className={styles.blockedBody}>{blocked.explanation}</p>
          </>
        )}

        {!isBlocked && (
          <h2 id="persona-review-question" className={styles.question}>{t('question')}</h2>
        )}

        <section aria-labelledby="persona-review-files">
          <h3 id="persona-review-files" className={styles.sectionTitle}>{t('files.heading')}</h3>
          <p className={styles.metaNote}>
            {t('files.summary', { added: summary.added, deleted: summary.deleted })}
          </p>
          <ul className={styles.fileList}>
            {summary.files.map(file => (
              <li key={file.path} className={styles.fileRow}>
                <span className={styles.filePath}>{file.path}</span>
                <span className={styles.fileStats}>+{file.added} / −{file.deleted}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="persona-review-patch">
          <h3 id="persona-review-patch" className={styles.sectionTitle}>{t('patch.heading')}</h3>
          {summary.secretsRedacted && (
            <p className={styles.metaNote}>{t('patch.redacted')}</p>
          )}
          {summary.patchTruncated && (
            <p className={styles.metaNote}>
              {t('patch.truncated', { limit: summary.patchLimitBytes })}
            </p>
          )}
          <pre className={styles.patch}>{summary.patch}</pre>
        </section>

        {summary.testsClaimed.length > 0 && (
          <section aria-labelledby="persona-review-tests">
            <h3 id="persona-review-tests" className={styles.sectionTitle}>{t('tests.heading')}</h3>
            <ul className={styles.tests}>
              {summary.testsClaimed.map(test => (
                <li key={test}>{test}</li>
              ))}
            </ul>
          </section>
        )}

        {mode === 'feedback' && !isBlocked && (
          <div className={styles.feedback}>
            <label className={styles.sectionTitle} htmlFor="persona-review-feedback">{t('feedback.label')}</label>
            <textarea
              id="persona-review-feedback"
              className={styles.textarea}
              value={feedback}
              placeholder={t('feedback.placeholder')}
              onChange={(event) => { setFeedback(event.target.value) }}
            />
            <div className={styles.actions}>
              <Button
                variant="primary"
                disabled={feedback.trim() === ''}
                onClick={() => {
                  onRequestChanges?.(feedback.trim())
                  setFeedback('')
                  setMode('review')
                }}
              >
                {t('feedback.submit')}
              </Button>
              <Button variant="secondary" onClick={() => { setMode('review') }}>{t('feedback.cancel')}</Button>
            </div>
          </div>
        )}

        {mode === 'discard' && !isBlocked && (
          <div className={styles.confirm} role="alertdialog" aria-labelledby="persona-review-discard-title">
            <h3 id="persona-review-discard-title" className={styles.question}>{t('discard.title')}</h3>
            <p className={styles.blockedBody}>{t('discard.body')}</p>
            <div className={styles.confirmActions}>
              <Button variant="danger" onClick={() => { onDiscard?.(); setMode('review') }}>{t('discard.confirm')}</Button>
              <Button variant="secondary" onClick={() => { setMode('review') }}>{t('discard.cancel')}</Button>
            </div>
          </div>
        )}

        {mode === 'review' && !isBlocked && (
          <div className={styles.actions}>
            <Button variant="primary" onClick={() => { onAccept?.() }}>{t('action.accept')}</Button>
            <Button variant="secondary" onClick={() => { setMode('feedback') }}>{t('action.requestChanges')}</Button>
            <Button variant="secondary" onClick={() => { setMode('discard') }}>{t('action.discard')}</Button>
          </div>
        )}
      </article>
    </div>
  )
}

/**
 * Revisar mudanças — the plain-language review of a persona's draft (SIMPLE-WORKSPACE-SPEC §3–§6, SW-8).
 * One question ("Aplico estas mudanças na sua pasta?"), files with Novo/Mudou/Apagado, before/after by file type,
 * three actions. No git words anywhere on this screen: those live only in Projeto › Configurações avançadas.
 */

import { useState, type ReactNode } from 'react'
import { Button, FileChangeRow, summarizeFileChanges } from '../../primitives/index.ts'
import { usePersonaMotion } from '../../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../../preview/locale-bind.ts'
import { bindLocale } from '../../preview/locale-bind.ts'
import { pt as defaultDict } from '../../locale/review/locales.ts'
import { ApplyNotice } from './ApplyNotice.tsx'
import { ConflictChoices } from './ConflictChoices.tsx'
import { FilePreview } from './FilePreview.tsx'
import type { ApplyPhase, ConflictChoice, DraftFileUi } from './draft-types.ts'
import styles from './DraftReview.module.css'

export interface DraftReviewPanelProps {
  readonly dict?: LocaleDict
  /** Who made the draft ("Bia"). Falls back to "A persona". */
  readonly personaName?: string | undefined
  readonly taskTitle?: string
  readonly files: readonly DraftFileUi[]
  readonly phase?: ApplyPhase
  readonly secretsRedacted?: boolean
  readonly testsClaimed?: readonly string[]
  /** The folder changed under the draft and the host could not say which files: nothing can be applied. */
  readonly blocked?: boolean
  /** What the host said about the clash, kept for support: folded, never the headline. */
  readonly blockedDetail?: string | undefined
  readonly onApply?: (choices: Readonly<Record<string, ConflictChoice>>) => void
  readonly onRequestChanges?: (feedback: string) => void
  readonly onDiscard?: () => void
  readonly onRetry?: () => void
  readonly onOpenDraftFile?: (fileId: string) => void
}

type Mode = 'review' | 'feedback' | 'discard'

export function DraftReviewPanel({
  dict = defaultDict,
  personaName,
  taskTitle = '',
  files,
  phase = { kind: 'idle' },
  secretsRedacted = false,
  testsClaimed = [],
  blocked = false,
  blockedDetail,
  onApply,
  onRequestChanges,
  onDiscard,
  onRetry,
  onOpenDraftFile,
}: DraftReviewPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const name = personaName !== undefined && personaName.trim() !== '' ? personaName.trim() : t('persona.fallback')
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [mode, setMode] = useState<Mode>('review')
  const [feedback, setFeedback] = useState('')
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(files.length === 1 ? [files[0]!.id] : []))
  const [choices, setChoices] = useState<Readonly<Record<string, ConflictChoice | undefined>>>({})

  const conflicts = files.filter(file => file.conflict === true)
  const unresolved = conflicts.filter(file => choices[file.id] === undefined).length
  const working = phase.kind === 'applying' || phase.kind === 'downloading'

  const summary = summarizeFileChanges(files, {
    files: count => (count === 1 ? t('files.one') : t('files.many', { count })),
    new: count => (count === 1 ? t('files.new.one') : t('files.new.many', { count })),
    changed: count => (count === 1 ? t('files.changed.one') : t('files.changed.many', { count })),
    deleted: count => (count === 1 ? t('files.deleted.one') : t('files.deleted.many', { count })),
  })
  const rowLabels = {
    kind: { new: t('kind.new'), changed: t('kind.changed'), deleted: t('kind.deleted') },
    deletedNote: t('kind.deletedNote'),
    show: t('file.show'),
    hide: t('file.hide'),
  }
  const toggle = (id: string): void => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const apply = (): void => {
    const picked: Record<string, ConflictChoice> = {}
    for (const file of conflicts) {
      const choice = choices[file.id]
      if (choice !== undefined) picked[file.id] = choice
    }
    onApply?.(picked)
  }

  return (
    <div className={styles.shell} ref={motion.ref} style={motion.style} data-persona-surface="review-delivery">
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>
          {taskTitle === '' ? '' : `${taskTitle} — `}{t('subtitle', { name })}
        </p>
      </header>

      <article className={styles.card} aria-labelledby="persona-review-question">
        {blocked ? (
          <>
            <span className={styles.chipBlocked}>{t('blocked.chip')}</span>
            <h2 id="persona-review-question" className={styles.question}>{t('blocked.title', { name })}</h2>
            <p className={styles.body}>{t('conflict.body', { name })}</p>
            {blockedDetail !== undefined && blockedDetail.trim() !== '' && (
              <details className={styles.details}>
                <summary>{t('apply.details')}</summary>
                <pre className={styles.detailText}>{blockedDetail}</pre>
              </details>
            )}
          </>
        ) : (
          <h2 id="persona-review-question" className={styles.question}>{t('question')}</h2>
        )}

        <section aria-labelledby="persona-review-files">
          <h3 id="persona-review-files" className={styles.sectionTitle}>{t('files.heading')}</h3>
          <p className={styles.summary}>{summary}</p>
          {secretsRedacted && <p className={styles.metaNote}>{t('patch.redacted')}</p>}
          <ul className={styles.fileList}>
            {files.map(file => (
              <FileChangeRow
                key={file.id}
                change={file}
                labels={rowLabels}
                badge={file.conflict === true ? { label: t('conflict.chip'), tone: 'warning' } : undefined}
                expanded={open.has(file.id)}
                onToggle={() => { toggle(file.id) }}
              >
                <FilePreview file={file} t={t} onOpenDraftFile={onOpenDraftFile} />
              </FileChangeRow>
            ))}
          </ul>
        </section>

        <ConflictChoices
          files={files}
          personaName={name}
          choices={choices}
          onChoose={(fileId, choice) => { setChoices(current => ({ ...current, [fileId]: choice })) }}
          t={t}
        />

        {testsClaimed.length > 0 && (
          <section aria-labelledby="persona-review-tests">
            <h3 id="persona-review-tests" className={styles.sectionTitle}>{t('tests.heading')}</h3>
            <ul className={styles.tests}>
              {testsClaimed.map(test => <li key={test}>{test}</li>)}
            </ul>
          </section>
        )}

        <ApplyNotice phase={phase} t={t} onRetry={onRetry} />

        {mode === 'feedback' && !blocked && (
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

        {mode === 'discard' && (
          <div className={styles.confirm} role="alertdialog" aria-labelledby="persona-review-discard-title" aria-describedby="persona-review-discard-body">
            <h3 id="persona-review-discard-title" className={styles.question}>{t('discard.title')}</h3>
            <p id="persona-review-discard-body" className={styles.body}>{t('discard.body', { name })}</p>
            <div className={styles.actions}>
              <Button variant="danger" onClick={() => { onDiscard?.(); setMode('review') }}>{t('discard.confirm')}</Button>
              <Button variant="secondary" onClick={() => { setMode('review') }}>{t('discard.cancel')}</Button>
            </div>
          </div>
        )}

        {mode === 'review' && (
          <div className={styles.footer}>
            {unresolved > 0 && (
              <p className={styles.pending} role="status">
                {unresolved === 1 ? t('conflict.pending.one') : t('conflict.pending.many', { count: unresolved })}
              </p>
            )}
            <div className={styles.actions}>
              {!blocked && (
                <Button
                  variant="primary"
                  loading={phase.kind === 'applying'}
                  disabled={unresolved > 0 || working || onApply === undefined}
                  onClick={apply}
                >
                  {phase.kind === 'applying' ? t('apply.applying') : t('action.accept')}
                </Button>
              )}
              <Button variant="secondary" disabled={working} onClick={() => { setMode('feedback') }}>{t('action.requestChanges')}</Button>
              <Button variant="ghost" disabled={working} onClick={() => { setMode('discard') }}>{t('action.discard')}</Button>
            </div>
          </div>
        )}
      </article>
    </div>
  )
}

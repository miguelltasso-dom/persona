/**
 * Revisar mudanças — the plain-language review of a persona's draft (SIMPLE-WORKSPACE-SPEC §3–§6, SW-8) laid out in two
 * panes (REVIEW-APPROVALS-REDESIGN §1): who prepared what on top, the files on the left, a big preview of the selected
 * file on the right (or, for a clash, the focused choice), and a fixed bar with the three actions. No git words anywhere
 * on this screen: those live only in Projeto › Configurações avançadas.
 */

import { useState, type ReactNode } from 'react'
import { Avatar, Button, Chip, summarizeFileChanges, type ChipTone } from '../../primitives/index.ts'
import { usePersonaMotion } from '../../theme/usePersonaMotion.ts'
import type { LocaleDict } from '../../preview/locale-bind.ts'
import { bindLocale } from '../../preview/locale-bind.ts'
import { pt as defaultDict } from '../../locale/review/locales.ts'
import { AppliedMoment } from './AppliedMoment.tsx'
import { ApplyNotice } from './ApplyNotice.tsx'
import { ConflictChoices } from './ConflictChoices.tsx'
import { FilePreview } from './FilePreview.tsx'
import { ReviewFileList } from './ReviewFileList.tsx'
import type { ApplyPhase, ConflictChoice, DraftFileUi } from './draft-types.ts'
import styles from './DraftReview.module.css'

export interface DraftReviewPanelProps {
  readonly dict?: LocaleDict
  /** Who made the draft ("Bia"). Falls back to "A persona". */
  readonly personaName?: string | undefined
  /** Her animal's portrait (the header wears it); initials when unknown. */
  readonly personaAvatarSrc?: string | undefined
  /** What she says she did, in her words (up to 2 lines). Without it the header says nothing extra: the list has the words summary. */
  readonly personaSummary?: string | undefined
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
  /** After a successful apply: "Desfazer" (only drawn when the host kept the earlier versions) and the way out. */
  readonly onUndoApplied?: (() => void) | undefined
  readonly onLeave?: (() => void) | undefined
  /** A capture-only sample (dev seed): the header says "Exemplo" so it is never taken for real work. */
  readonly example?: boolean | undefined
}

type Mode = 'review' | 'feedback' | 'discard'

export function DraftReviewPanel({
  dict = defaultDict,
  personaName,
  personaAvatarSrc,
  personaSummary,
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
  onUndoApplied,
  onLeave,
  example = false,
}: DraftReviewPanelProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const name = personaName !== undefined && personaName.trim() !== '' ? personaName.trim() : t('persona.fallback')
  const motion = usePersonaMotion({ preset: 'base', fromOpacity: 0, fromTranslateY: 6 })
  const [mode, setMode] = useState<Mode>('review')
  const [feedback, setFeedback] = useState('')
  const [pickedId, setPickedId] = useState<string | undefined>(undefined)
  const [choices, setChoices] = useState<Readonly<Record<string, ConflictChoice | undefined>>>({})

  const conflicts = files.filter(file => file.conflict === true)
  const unresolved = conflicts.filter(file => choices[file.id] === undefined).length
  const working = phase.kind === 'applying' || phase.kind === 'downloading'
  // A clash is a moment of its own: with nothing picked, the first file that needs a choice is the one in front.
  const selected = files.find(file => file.id === pickedId) ?? conflicts.find(file => choices[file.id] === undefined) ?? files[0]

  const summary = summarizeFileChanges(files, {
    files: count => (count === 1 ? t('files.one') : t('files.many', { count })),
    new: count => (count === 1 ? t('files.new.one') : t('files.new.many', { count })),
    changed: count => (count === 1 ? t('files.changed.one') : t('files.changed.many', { count })),
    deleted: count => (count === 1 ? t('files.deleted.one') : t('files.deleted.many', { count })),
  })
  const apply = (): void => {
    const picked: Record<string, ConflictChoice> = {}
    for (const file of conflicts) {
      const choice = choices[file.id]
      if (choice !== undefined) picked[file.id] = choice
    }
    onApply?.(picked)
  }
  const kindTone: Readonly<Record<DraftFileUi['kind'], ChipTone>> = { new: 'success', changed: 'info', deleted: 'danger' }

  if (phase.kind === 'done') {
    return (
      <div className={styles.shell} ref={motion.ref} style={motion.style} data-persona-surface="review-delivery" data-testid="review-panel">
        <AppliedMoment
          count={phase.count ?? files.length}
          undoable={phase.undoable}
          onUndo={onUndoApplied}
          onBack={() => { onLeave?.() }}
          t={t}
        />
      </div>
    )
  }

  return (
    <div className={styles.shell} ref={motion.ref} style={motion.style} data-persona-surface="review-delivery" data-testid="review-panel">
      <header className={styles.hero}>
        <Avatar name={name} size={56} shape="portrait" decorative {...(personaAvatarSrc === undefined ? {} : { src: personaAvatarSrc })} />
        <div className={styles.heroText}>
          <p className={styles.eyebrow}>
            {t('title')}
            {example && <> <Chip size="s" tone="neutral">{t('example.chip')}</Chip></>}
          </p>
          <h1 className={styles.title}>{taskTitle === '' ? t('hero.title.notask', { name }) : t('hero.title', { name, task: taskTitle })}</h1>
          <p className={styles.subtitle}>{t('subtitle', { name })}</p>
          {personaSummary !== undefined && personaSummary.trim() !== '' && <p className={styles.personaSummary}>{personaSummary.trim()}</p>}
        </div>
      </header>

      {blocked && (
        <section className={styles.blockedCard} aria-labelledby="persona-review-blocked">
          <span className={styles.chipBlocked}>{t('blocked.chip')}</span>
          <h2 id="persona-review-blocked" className={styles.question}>{t('blocked.title', { name })}</h2>
          <p className={styles.body}>{t('conflict.body', { name })}</p>
          {blockedDetail !== undefined && blockedDetail.trim() !== '' && (
            <details className={styles.details}>
              <summary>{t('apply.details')}</summary>
              <pre className={styles.detailText}>{blockedDetail}</pre>
            </details>
          )}
        </section>
      )}

      <div className={styles.workspace}>
        <section className={styles.side} aria-labelledby="persona-review-files" data-testid="review-files">
          <h3 id="persona-review-files" className={styles.sectionTitle}>{t('files.heading')}</h3>
          {selected !== undefined && (
            <ReviewFileList
              files={files}
              selectedId={selected.id}
              onSelect={setPickedId}
              labels={{
                heading: t('files.heading'),
                kind: { new: t('kind.new'), changed: t('kind.changed'), deleted: t('kind.deleted') },
                deletedNote: t('kind.deletedNote'),
                conflict: t('conflict.chip'),
              }}
            />
          )}
          <p className={styles.summary}>{summary}</p>
          {secretsRedacted && <p className={styles.metaNote}>{t('patch.redacted')}</p>}
        </section>

        {selected !== undefined && (
          <section className={styles.pane} aria-labelledby="persona-review-pane-title" data-testid="review-preview" data-file-id={selected.id}>
            <div className={styles.paneHead}>
              <h3 id="persona-review-pane-title" className={styles.paneTitle}>{selected.name}</h3>
              {selected.conflict !== true && <Chip size="s" tone={kindTone[selected.kind]}>{t(`kind.${selected.kind}`)}</Chip>}
              {selected.folder !== undefined && <span className={styles.paneFolder}>{selected.folder}</span>}
            </div>
            {selected.conflict === true && (
              <ConflictChoices
                files={[selected]}
                personaName={name}
                choices={choices}
                onChoose={(fileId, choice) => { setChoices(current => ({ ...current, [fileId]: choice })) }}
                t={t}
              />
            )}
            <FilePreview file={selected} t={t} onOpenDraftFile={onOpenDraftFile} />
          </section>
        )}
      </div>

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
        <div className={styles.bar} data-testid="review-bar">
          <div className={styles.barText}>
            <h2 id="persona-review-question" className={styles.barQuestion}>{t('question')}</h2>
            {unresolved > 0
              ? (
                <p className={styles.pending} role="status">
                  {unresolved === 1 ? t('conflict.pending.one') : t('conflict.pending.many', { count: unresolved })}
                </p>
              )
              : <p className={styles.assurance}>{t('bar.assurance')}</p>}
          </div>
          <div className={styles.actions}>
            {!blocked && (
              <Button
                variant="primary"
                data-testid="review-apply"
                loading={phase.kind === 'applying'}
                disabled={unresolved > 0 || working || onApply === undefined}
                onClick={apply}
              >
                {phase.kind === 'applying' ? t('apply.applying') : t('action.accept')}
              </Button>
            )}
            <Button variant="secondary" data-testid="review-request-changes" disabled={working} onClick={() => { setMode('feedback') }}>{t('action.requestChanges')}</Button>
            <Button variant="ghost" data-testid="review-discard" disabled={working} onClick={() => { setMode('discard') }}>{t('action.discard')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * "Ensinar a persona" (W2-10, WAVE2-SPEC b.5) — review of the draft the host built from the recording.
 * Not a modal: the recorded screen is gone, so the person gets a whole screen to read and edit the steps.
 * Saving only ever creates a CANDIDATE skill; turning it on or sharing it are separate, explicit actions (TeachDone).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TeachStepView } from '@deepseek-ai/dsh-persona-host/types'
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  Modal,
  Screen,
  ScreenHeader,
  TeachStepCard,
  TeachStepList,
  UiIcon,
  type TeachStepCardProps,
} from '../primitives/index.ts'
import {
  TEACH_MAX_STEPS,
  addStep,
  blankStepCount,
  canSaveCandidate,
  moveStep,
  removeStep,
  stepsFromDraft,
  stepsToWire,
  teachFailureKind,
  thumbnailSrc,
  updateStep,
  type EditableStep,
} from './teach-model.ts'
import styles from './TeachFlow.module.css'

export type TeachT = (key: string, params?: Readonly<Record<string, string | number>>) => string

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Full-window layer the whole post-recording flow lives in (studying, review, done). It is modal: focus starts inside,
 * Tab wraps at the ends, and focus that escapes to the app underneath is pulled back (the rail is still in the page).
 * A dialog opened on top of it (zoom, discard confirmation) has its own trap and is left alone.
 */
export function TeachLayer({ label, onEscape, children }: { readonly label: string; readonly onEscape?: (() => void) | undefined; readonly children: ReactNode }): ReactNode {
  const layer = useRef<HTMLDivElement>(null)
  // Latest handler without re-subscribing the document listeners on every render.
  const escape = useRef(onEscape)
  escape.current = onEscape
  useEffect(() => {
    const node = layer.current
    if (node === null) return undefined
    const inside = (): HTMLElement[] => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.closest('[role="dialog"]') === node)
    if (!node.contains(document.activeElement)) (inside()[0] ?? node).focus()
    const onFocusIn = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof Node) || node.contains(target)) return
      // Focus went to the page underneath (or a sibling overlay that is not ours): bring it back.
      if (target instanceof Element && target.closest('[role="dialog"]') !== null) return
      ;(inside()[0] ?? node).focus()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      const active = document.activeElement
      // A dialog opened on top of the layer (zoom, discard confirmation) owns Esc and Tab while it has focus.
      if (active instanceof Element && active !== document.body && active.closest('[role="dialog"]') !== node) return
      if (event.key === 'Escape') {
        if (escape.current !== undefined) { event.preventDefault(); escape.current() }
        return
      }
      if (event.key !== 'Tab') return
      const items = inside()
      const first = items[0]
      const last = items[items.length - 1]
      if (first === undefined || last === undefined) return
      // Focus fell to the page (the control it was on went away): the next Tab comes back into the layer.
      if (active === null || active === document.body) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return }
      if (event.shiftKey && active === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown)
    // The page underneath is out of reach while the layer is up (not focusable, not read): everything that is not the layer or
    // one of its ancestors gets `inert`. Only what this effect marked is restored, so other layers' marks are never undone.
    const marked: Element[] = []
    for (let branch: Element = node; branch !== document.body; branch = branch.parentElement ?? document.body) {
      const parent = branch.parentElement
      if (parent === null) break
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || sibling.hasAttribute('inert') || sibling.tagName === 'SCRIPT') continue
        sibling.setAttribute('inert', '')
        marked.push(sibling)
      }
    }
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown)
      for (const element of marked) element.removeAttribute('inert')
    }
  }, [])
  return (
    <div ref={layer} className={styles.layer} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} data-persona-teach-layer="">
      {children}
    </div>
  )
}

export interface TeachStudyingProps {
  readonly t: TeachT
  readonly personaName: string
  readonly art: string
}

/** "Montando o passo a passo": honest wait, no spinner on a blank page. */
export function TeachStudying({ t, personaName, art }: TeachStudyingProps): ReactNode {
  return (
    <Screen width="reading" aria-busy="true">
      <EmptyState
        illustration={art === '' ? undefined : art}
        title={t('teach.studyingTitle', { name: personaName })}
        body={t('teach.studyingHint')}
      />
    </Screen>
  )
}

export interface TeachEmptyProps {
  readonly t: TeachT
  readonly art: string
  readonly onWrite: () => void
  readonly onRecordAgain: () => void
}

/** The recording gave no steps: write them by hand or record again. */
export function TeachEmpty({ t, art, onWrite, onRecordAgain }: TeachEmptyProps): ReactNode {
  return (
    <Screen width="reading">
      <EmptyState
        illustration={art === '' ? undefined : art}
        title={t('teach.empty.title')}
        body={t('teach.empty.body')}
        action={<Button variant="primary" onClick={onWrite}>{t('teach.empty.write')}</Button>}
        secondaryAction={<Button variant="secondary" onClick={onRecordAgain}>{t('teach.empty.again')}</Button>}
      />
    </Screen>
  )
}

export interface TeachFailedProps {
  readonly t: TeachT
  readonly art: string
  readonly onRetry: () => void
  readonly onClose: () => void
}

export function TeachFailed({ t, art, onRetry, onClose }: TeachFailedProps): ReactNode {
  return (
    <Screen width="reading">
      <EmptyState
        illustration={art === '' ? undefined : art}
        title={t('teach.failed.title')}
        body={t('teach.failed.body')}
        action={<Button variant="primary" onClick={onRetry}>{t('teach.failed.retry')}</Button>}
        secondaryAction={<Button variant="ghost" onClick={onClose}>{t('teach.done.close')}</Button>}
      />
    </Screen>
  )
}

export interface TeachReviewProps {
  readonly t: TeachT
  readonly personaName: string
  readonly portraitSrc?: string | undefined
  /** Name the host gave the skill (read-only: the host keeps the name). */
  readonly skillTitle: string
  /** Steps from the host draft; an empty list starts with one blank step to write in. */
  readonly draftSteps: readonly TeachStepView[]
  /** Save as candidate. Rejects with the host error; the screen shows what the person can do about it. */
  readonly onSave: (steps: readonly TeachStepView[]) => Promise<void>
  readonly onDiscard: () => void
}

/** Step editor + the one primary action ("Salvar como skill candidata"). */
export function TeachReview({ t, personaName, portraitSrc, skillTitle, draftSteps, onSave, onDiscard }: TeachReviewProps): ReactNode {
  const initial = useMemo(() => {
    const rows = stepsFromDraft(draftSteps)
    return rows.length > 0 ? rows : addStep([])
  }, [draftSteps])
  const [steps, setSteps] = useState<readonly EditableStep[]>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<{ readonly n: number; readonly src: string } | null>(null)
  const listWrap = useRef<HTMLDivElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const focusLast = useRef(false)

  useEffect(() => {
    if (!focusLast.current) return
    focusLast.current = false
    const rows = listWrap.current?.querySelectorAll<HTMLTextAreaElement>('li textarea')
    rows?.[rows.length - 1]?.focus()
  }, [steps.length])

  const blanks = blankStepCount(steps)
  const canSave = canSaveCandidate(steps)
  const atLimit = steps.length >= TEACH_MAX_STEPS

  const save = (): void => {
    if (!canSave || busy) return
    setBusy(true)
    setError(null)
    void onSave(stepsToWire(steps)).catch((caught: unknown) => {
      const kind = teachFailureKind(caught)
      setError(kind === 'tools' ? t('teach.error.tools', { name: personaName })
        : kind === 'forbidden' ? t('teach.error.forbidden')
          : kind === 'notFound' ? t('teach.error.notFound')
            : t('teach.error.generic'))
    }).finally(() => { setBusy(false) })
  }

  const cardLabels = (n: number): TeachStepCardProps['labels'] => ({
    step: t('teach.stepLabel', { n }),
    instruction: t('teach.step.instruction'),
    check: t('teach.step.check'),
    moveUp: t('teach.step.moveUp', { n }),
    moveDown: t('teach.step.moveDown', { n }),
    remove: t('teach.step.remove', { n }),
    blur: t('teach.step.blur'),
    enlarge: t('teach.step.enlarge', { n }),
    noThumbnail: t('teach.step.noThumbnail'),
  })

  return (
    <Screen>
      <ScreenHeader
        icon="skills"
        eyebrow={t('teach.review.eyebrow', { name: personaName })}
        title={t('teach.review.title', { name: personaName })}
        subtitle={t('teach.review.subtitle')}
      />
      <div className={styles.reviewGrid}>
        <div ref={listWrap} className={styles.reviewList}>
          <TeachStepList label={t('teach.review.stepsLabel')}>
            {steps.map((step, index) => {
              const n = index + 1
              const src = thumbnailSrc(step.thumbnailRef)
              return (
                <TeachStepCard
                  key={step.key}
                  order={n}
                  total={steps.length}
                  {...(src === undefined ? {} : { thumbnailSrc: src, onEnlarge: () => { setZoom({ n, src }) } })}
                  instruction={step.instruction}
                  check={step.verifyHint}
                  onInstructionChange={(text) => { setSteps(current => updateStep(current, step.key, { instruction: text })) }}
                  onCheckChange={(text) => { setSteps(current => updateStep(current, step.key, { verifyHint: text })) }}
                  onMove={(direction) => { setSteps(current => moveStep(current, step.key, direction)) }}
                  onRemove={() => {
                    setSteps(current => removeStep(current, step.key))
                    addButton.current?.focus()
                  }}
                  labels={cardLabels(n)}
                />
              )
            })}
          </TeachStepList>
          <div className={styles.addRow}>
            <Button
              ref={addButton}
              variant="secondary"
              icon={<UiIcon name="plus" size={16} />}
              disabled={atLimit}
              onClick={() => { focusLast.current = true; setSteps(current => addStep(current)) }}
            >
              {t('teach.step.add')}
            </Button>
            {atLimit && <span className={styles.hint}>{t('teach.step.limit')}</span>}
          </div>
        </div>

        <Card padding="l" className={styles.side}>
          <div className={styles.sideHead}>
            <Avatar name={personaName} src={portraitSrc} size={40} shape="portrait" decorative />
            <div>
              <p className={styles.sideLabel}>{t('teach.review.skill')}</p>
              <p className={styles.sideTitle}>{skillTitle}</p>
              <p className={styles.hint}>{t('teach.review.stepCount', { count: stepsToWire(steps).length })}</p>
            </div>
          </div>
          <p className={styles.hint}>{t('teach.review.whatIsSkill', { name: personaName })}</p>
          <p className={styles.hint}>{t('teach.review.candidateNote', { name: personaName })}</p>
          {blanks > 0 && canSave && <p className={styles.hint}>{t('teach.review.blank')}</p>}
          {!canSave && <p className={styles.hint}>{t('teach.review.needStep')}</p>}
          {error !== null && <p className={styles.failure} role="alert">{error}</p>}
          <div className={styles.sideActions}>
            <Button variant="primary" block loading={busy} disabled={!canSave} onClick={save}>
              {busy ? t('teach.review.saving') : t('teach.review.save')}
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={onDiscard}>{t('teach.review.discard')}</Button>
          </div>
        </Card>
      </div>
      {zoom !== null && (
        <Modal
          open
          size="l"
          title={t('teach.stepLabel', { n: zoom.n })}
          closeLabel={t('teach.step.imageClose')}
          onClose={() => { setZoom(null) }}
        >
          <img className={styles.zoomImage} src={zoom.src} alt="" />
        </Modal>
      )}
    </Screen>
  )
}

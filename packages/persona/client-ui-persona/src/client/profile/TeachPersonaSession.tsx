/**
 * "Ensinar a persona" (W2-10) — everything that happens after the consent step, as one small state machine:
 *   countdown → recording (pill + frame) → narrate (the person's own words) → studying → review → done
 * with honest exits (nothing to record with, no steps found, failure). Nothing is activated or shared by itself:
 * review saves a CANDIDATE; turning it on / sharing are separate buttons in the last step (TeachDone).
 * The recording itself never leaves the computer; the renderer only talks to the desktop bridge and the local host.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { TeachDraftView, TeachStepView } from '@deepseek-ai/dsh-persona-host/types'
import { personaPortraitSrc } from '../approvals/approvals-ui-helpers.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal, RecordingFrame, RecordingPill, Switch, Textarea, type RecordingState } from '../primitives/index.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import { TeachDone } from '../teach/TeachDone.tsx'
import { TeachEmpty, TeachFailed, TeachLayer, TeachReview, TeachStudying } from '../teach/TeachReview.tsx'
import type { TeachLive, TeachRemote } from '../teach/teach-deps.ts'
import { clearTeachHandoff, restoreTeachOpener, takeTeachHandoff, type TeachHandoff } from '../teach/teach-handoff.ts'
import { TEACH_MAX_SECONDS, type TeachStopPayload } from '../teach/teach-recorder.ts'
import styles from '../teach/TeachFlow.module.css'
import { teachIllustrationSrc } from './teach-art-key.ts'

export interface TeachCaptureState {
  readonly personaId: string
  readonly sessionId: string
  readonly microphone: boolean
}

export interface TeachPersonaSessionInjected {
  readonly dict: LocaleDict
  readonly live: TeachLive
  readonly persona: TeachRemote
  readonly hooks: { readonly shell: HostObservable<ShellState> }
  closeTeachCapture(): void
  /** "Gravar de novo": back to the consent step for the same persona. */
  openTeachPersona(personaId: string): void
}

export type TeachPersonaSessionProps = InjectFace<TeachPersonaSessionInjected>

type Phase = 'countdown' | 'recording' | 'startFailed' | 'narrate' | 'studying' | 'review' | 'empty' | 'failed' | 'done'

const WARN_AT_SECONDS = TEACH_MAX_SECONDS - 60

export function TeachPersonaSession({
  dict,
  live,
  persona,
  useShell,
  closeTeachCapture,
  openTeachPersona,
}: TeachPersonaSessionProps): ReactNode {
  const capture = useShell(state => state.teachCapture)
  const sessionId = capture?.sessionId ?? ''
  const personaId = capture?.personaId ?? ''
  const team = live.observable.getSnapshot().team
  const who = team?.personas.find(row => row.id === personaId)
  const name = who?.name ?? personaId
  const portrait = who === undefined ? undefined : personaPortraitSrc(who.avatarRef, who.name)
  const art = teachIllustrationSrc(personaId === '' ? null : personaId, team)
  const t = useMemo(() => (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params), [dict])

  const handoff = useRef<TeachHandoff | null>(null)
  const recorderOpen = useRef(false)
  const payload = useRef<TeachStopPayload | null>(null)
  const [phase, setPhase] = useState<Phase>('countdown')
  const [count, setCount] = useState(3)
  const [paused, setPaused] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [typed, setTyped] = useState('')
  const [discardImages, setDiscardImages] = useState(false)
  const [draft, setDraft] = useState<TeachDraftView | null>(null)
  const [saved, setSaved] = useState<{ readonly skillId: string; readonly skillTitle: string } | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [announce, setAnnounce] = useState('')
  const [writeOwn, setWriteOwn] = useState(false)

  // A new recording: take what the consent step handed over and start from the top.
  useEffect(() => {
    if (sessionId === '') return undefined
    handoff.current = takeTeachHandoff()
    recorderOpen.current = false
    payload.current = null
    setPhase('countdown')
    setCount(3)
    setPaused(false)
    setElapsedSec(0)
    setTyped('')
    setDiscardImages(false)
    setDraft(null)
    setSaved(null)
    setConfirmDiscard(false)
    setWriteOwn(false)
    return () => {
      // Leaving while the stream is still open (window closed, session replaced): release it, keep nothing.
      if (recorderOpen.current && handoff.current !== null) {
        recorderOpen.current = false
        void handoff.current.recorder.stop({ typed: '', discardImages: true }).catch(() => undefined)
      }
    }
  }, [sessionId])

  // 3 · 2 · 1 inside the pill, then the recorder opens the chosen screen/window.
  useEffect(() => {
    if (sessionId === '' || phase !== 'countdown') return undefined
    const current = handoff.current
    if (current === null) { setPhase('startFailed'); return undefined }
    if (count > 0) {
      const timer = window.setTimeout(() => { setCount(value => value - 1) }, 1000)
      return () => { window.clearTimeout(timer) }
    }
    let alive = true
    void current.recorder.start(current.sourceId, false).then(() => {
      if (!alive) return
      recorderOpen.current = true
      setPhase('recording')
      setAnnounce(t('teach.live.recordingStarted'))
    }).catch(() => { if (alive) setPhase('startFailed') })
    return () => { alive = false }
  }, [sessionId, phase, count, t])

  useEffect(() => {
    if (phase !== 'recording' || paused) return undefined
    const timer = window.setInterval(() => { setElapsedSec(value => value + 1) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [phase, paused])

  const stopRecording = useCallback((): void => {
    setPhase('narrate')
    setAnnounce(t('teach.live.recordingStopped'))
    // Stop sampling right away; the final stop (with the person's words) comes from "Montar o passo a passo".
    void handoff.current?.recorder.pause().catch(() => undefined)
  }, [t])

  useEffect(() => {
    if (phase === 'recording' && elapsedSec >= TEACH_MAX_SECONDS) stopRecording()
  }, [phase, elapsedSec, stopRecording])

  const close = useCallback((): void => {
    clearTeachHandoff()
    closeTeachCapture()
    // After the layer is gone, keyboard focus returns to the button that opened "Ensinar".
    window.setTimeout(() => { restoreTeachOpener() }, 0)
  }, [closeTeachCapture])

  const finalize = useCallback(async (): Promise<void> => {
    const current = handoff.current
    if (current === null) { setPhase('failed'); return }
    setPhase('studying')
    try {
      if (payload.current === null) {
        payload.current = await current.recorder.stop({ typed: typed.trim(), discardImages })
        recorderOpen.current = false
      }
      const status = await live.stopTeachSession(sessionId, false, payload.current.transcript, payload.current.frames)
      if (status.status === 'unsupported') throw new Error('unsupported')
      const view = await live.getTeachDraft(sessionId)
      setDraft(view)
      setPhase(view.steps.length === 0 ? 'empty' : 'review')
      setAnnounce(t('teach.live.reviewReady'))
    } catch {
      setPhase('failed')
    }
  }, [typed, discardImages, live, sessionId, t])

  const discardRecording = useCallback((): void => {
    const current = handoff.current
    if (current !== null && recorderOpen.current) {
      recorderOpen.current = false
      void current.recorder.stop({ typed: '', discardImages: true }).catch(() => undefined)
    }
    close()
  }, [close])

  const scope = (): { readonly workspaceId: string; readonly projectId: string } => {
    const tenant = live.observable.getSnapshot().tenant
    if (tenant === null) throw new Error('no-scope')
    return { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
  }

  const saveCandidate = async (steps: readonly TeachStepView[]): Promise<void> => {
    const view = await live.submitTeachDraft(sessionId, steps, false)
    if (view.candidateSkillId === undefined) throw new Error('not-found')
    setSaved({ skillId: view.candidateSkillId, skillTitle: view.skillTitle })
    setPhase('done')
  }

  if (capture === null || sessionId === '') return null

  const layerLabel = t('teach.region')

  if (phase === 'countdown' || phase === 'recording') {
    const pillState: RecordingState = phase === 'countdown' ? 'countdown' : paused ? 'paused' : 'recording'
    return (
      <div className={styles.recordingRoot} data-persona-root="" data-persona-teach="recording">
        <RecordingFrame paused={paused} />
        <div className={styles.pillDock}>
          <RecordingPill
            state={pillState}
            watchingText={t('teach.watching', { name })}
            personaName={name}
            portraitSrc={portrait}
            elapsedSec={elapsedSec}
            countdown={count}
            warning={elapsedSec >= WARN_AT_SECONDS ? t('teach.limitWarning') : undefined}
            labels={{
              recording: t('teach.recording'),
              paused: t('teach.paused'),
              pause: t('teach.pause'),
              resume: t('teach.resume'),
              stop: t('teach.stop'),
              micOn: t('teach.microphoneOn'),
              micOff: t('teach.microphoneOff'),
              region: t('teach.recordingRegion'),
            }}
            onPause={() => {
              setPaused(true)
              void handoff.current?.recorder.pause().catch(() => undefined)
              void live.pauseTeachSession(sessionId)
            }}
            onResume={() => {
              setPaused(false)
              void handoff.current?.recorder.resume().catch(() => undefined)
              void live.resumeTeachSession(sessionId)
            }}
            onStop={stopRecording}
          />
        </div>
        <p className="persona-sr-only" aria-live="polite">{announce}</p>
      </div>
    )
  }

  if (phase === 'startFailed') {
    return (
      <TeachLayer label={layerLabel} onEscape={discardRecording}>
        <TeachFailed
          t={t}
          art={art}
          onRetry={() => { close(); openTeachPersona(personaId) }}
          onClose={discardRecording}
        />
      </TeachLayer>
    )
  }

  if (phase === 'narrate') {
    return (
      <Modal
        open
        size="m"
        title={t('teach.narrateTitle')}
        footer={(
          <>
            <Button variant="ghost" onClick={discardRecording}>{t('teach.discardRecording')}</Button>
            <Button variant="primary" onClick={() => { void finalize() }}>{t('teach.studyAction')}</Button>
          </>
        )}
      >
        <div className={styles.narrate}>
          <p>{t('teach.narrateBody', { name })}</p>
          <Textarea
            label={t('teach.narrateLabel')}
            hint={t('teach.narrateHint', { name })}
            rows={5}
            value={typed}
            onChange={(event) => { setTyped(event.target.value) }}
          />
          <div className={styles.switchRow}>
            <span className={styles.switchText}>
              <span id="persona-teach-discard-label" className={styles.switchLabel}>{t('teach.discardImages')}</span>
              <span id="persona-teach-discard-hint" className={styles.sourceNote}>{t('teach.discardImagesHint', { name })}</span>
            </span>
            <Switch
              checked={discardImages}
              labelledBy="persona-teach-discard-label"
              describedBy="persona-teach-discard-hint"
              onChange={setDiscardImages}
            />
          </div>
        </div>
      </Modal>
    )
  }

  if (phase === 'studying') {
    return (
      <TeachLayer label={layerLabel}>
        <TeachStudying t={t} personaName={name} art={art} />
      </TeachLayer>
    )
  }

  if (phase === 'failed') {
    return (
      <TeachLayer label={layerLabel} onEscape={discardRecording}>
        <TeachFailed t={t} art={art} onRetry={() => { void finalize() }} onClose={discardRecording} />
      </TeachLayer>
    )
  }

  if (phase === 'empty' && !writeOwn) {
    return (
      <TeachLayer label={layerLabel} onEscape={discardRecording}>
        <TeachEmpty
          t={t}
          art={art}
          onWrite={() => { setWriteOwn(true) }}
          onRecordAgain={() => { discardRecording(); openTeachPersona(personaId) }}
        />
      </TeachLayer>
    )
  }

  if (phase === 'done' && saved !== null) {
    const skillRequest = (): { readonly workspaceId: string; readonly projectId: string; readonly skillId: string } =>
      ({ ...scope(), skillId: saved.skillId })
    return (
      <TeachLayer label={layerLabel} onEscape={close}>
        <TeachDone
          t={t}
          personaName={name}
          skillTitle={saved.skillTitle}
          art={art}
          onActivate={async () => { await unwrapRemote(await persona.activateTaughtSkill(skillRequest())) }}
          onRevert={async () => { await unwrapRemote(await persona.rollbackTaughtSkill(skillRequest())) }}
          onShare={async (shareScope) => {
            await unwrapRemote(await persona.publishTaughtSkill({ ...skillRequest(), scope: shareScope, explicit: true }))
          }}
          onClose={close}
        />
      </TeachLayer>
    )
  }

  // review (or "write the steps yourself" after an empty draft)
  return (
    <TeachLayer label={layerLabel} onEscape={() => { setConfirmDiscard(true) }}>
      <TeachReview
        t={t}
        personaName={name}
        portraitSrc={portrait}
        skillTitle={draft?.skillTitle ?? ''}
        draftSteps={draft?.steps ?? []}
        onSave={saveCandidate}
        onDiscard={() => { setConfirmDiscard(true) }}
      />
      {confirmDiscard && (
        <Modal
          open
          size="m"
          title={t('teach.discardConfirm.title')}
          closeLabel={t('teach.close')}
          onClose={() => { setConfirmDiscard(false) }}
          footer={(
            <>
              <Button variant="ghost" onClick={() => { setConfirmDiscard(false) }}>{t('teach.discardConfirm.keep')}</Button>
              <Button variant="danger" onClick={discardRecording}>{t('teach.discardConfirm.confirm')}</Button>
            </>
          )}
        >
          <p>{t('teach.discardConfirm.body')}</p>
        </Modal>
      )}
    </TeachLayer>
  )
}

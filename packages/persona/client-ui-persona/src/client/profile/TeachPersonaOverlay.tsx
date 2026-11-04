/**
 * WAVE2-SPEC (b) steps 1–3: consent, then "what to record". Two steps in one modal; the recording itself never
 * happens inside a modal (it would cover the screen being recorded) — it hands over to TeachPersonaSession.
 *
 * Narration is typed after the recording (the microphone switch is gone: nothing here transcribes audio, and a
 * switch that records nothing would be a lie). Without the desktop bridge there is nothing to record with, and the
 * consent says so instead of walking the person to a dead end.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal, Notice, Tabs, UiIcon } from '../primitives/index.ts'
import { clearTeachHandoff, forgetTeachOpener, rememberTeachOpener, setTeachHandoff } from '../teach/teach-handoff.ts'
import { detectTeachRecorder, type TeachSource } from '../teach/teach-recorder.ts'
import { teachIllustrationSrc } from './teach-art-key.ts'
import type { TeachLiveSnapshot } from '../teach/teach-deps.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import flow from '../teach/TeachFlow.module.css'
import styles from './TeachPersonaOverlay.module.css'

const CONSENT_VERSION = 'teach-v1'

const CONSENT_LINES = [
  { icon: 'image' as const, labelKey: 'teach.consentRecordedLabel', bodyKey: 'teach.consentScreen' },
  { icon: 'lock' as const, labelKey: 'teach.consentStoredLabel', bodyKey: 'teach.consentLocal' },
  { icon: 'eye' as const, labelKey: 'teach.consentWhoLabel', bodyKey: 'teach.consentPrivate' },
] as const

export interface TeachPersonaOverlayInjected {
  readonly dict: LocaleDict
  readonly hooks: {
    readonly shell: HostObservable<ShellState>
    readonly live: HostObservable<TeachLiveSnapshot>
  }
  closeTeachPersona(): void
  /** Opens the host recording session. Resolves true when the recording screen has taken over. */
  beginTeachCapture(personaId: string, consentVersion: string, microphone: boolean): Promise<boolean>
}

export type TeachPersonaOverlayProps = InjectFace<TeachPersonaOverlayInjected>

type SourcesState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly sources: readonly TeachSource[] }

type Step = 'consent' | 'source'
type Kind = 'screen' | 'window'

export function TeachPersonaOverlay({
  dict,
  useShell,
  useLive,
  closeTeachPersona,
  beginTeachCapture,
}: TeachPersonaOverlayProps): ReactNode {
  const personaId = useShell(state => state.teachPersonaId)
  const team = useLive((state: TeachLiveSnapshot) => state.team)
  const capturing = useShell(state => state.teachCapture !== null)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const artSrc = teachIllustrationSrc(personaId, team)
  const open = personaId !== null
  // The control that opened this: remembered at the very first render with the flow open (before the modal takes focus).
  if (open) rememberTeachOpener(document.activeElement)
  const recorder = useMemo(() => (open ? detectTeachRecorder() : null), [open])

  const [step, setStep] = useState<Step>('consent')
  const [kind, setKind] = useState<Kind>('screen')
  const [sources, setSources] = useState<SourcesState>({ status: 'loading' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [beginFailed, setBeginFailed] = useState(false)

  const personaName = personaId === null || team === null
    ? t('teach.title')
    : (team.personas.find(row => row.id === personaId)?.name ?? t('teach.title'))

  useEffect(() => {
    if (open) return
    // Closed without starting a recording: nothing will give focus back later, so forget the opener.
    if (!capturing) forgetTeachOpener()
    setStep('consent')
    setKind('screen')
    setSelectedId(null)
    setBusy(false)
    setBeginFailed(false)
  }, [open, capturing])

  const loadSources = useCallback((): void => {
    if (recorder === null) return
    setSources({ status: 'loading' })
    void recorder.listSources().then((list) => {
      setSources({ status: 'ready', sources: list })
      setSelectedId(current => (current !== null && list.some(row => row.id === current) ? current : null))
    }).catch(() => { setSources({ status: 'error' }) })
  }, [recorder])

  useEffect(() => {
    if (open && step === 'source') loadSources()
  }, [open, step, loadSources])

  const begin = (): void => {
    if (personaId === null || recorder === null || selectedId === null || busy) return
    setBusy(true)
    setBeginFailed(false)
    setTeachHandoff({ recorder, sourceId: selectedId })
    void beginTeachCapture(personaId, CONSENT_VERSION, false).then((ok) => {
      if (ok) { closeTeachPersona(); return }
      clearTeachHandoff()
      setBeginFailed(true)
    }).catch(() => {
      clearTeachHandoff()
      setBeginFailed(true)
    }).finally(() => { setBusy(false) })
  }

  if (!open) return null

  const shown = sources.status === 'ready' ? sources.sources.filter(row => row.kind === kind) : []
  const noRecorder = recorder === null

  return (
    <Modal
      open
      size="m"
      eyebrow={t('teach.eyebrow', { step: step === 'consent' ? 1 : 2, total: 2 })}
      title={step === 'consent' ? t('teach.titleNamed', { name: personaName }) : t('teach.sourceTitle')}
      closeLabel={t('teach.close')}
      onClose={() => { closeTeachPersona() }}
      footer={step === 'consent' ? (
        <>
          <Button variant="ghost" onClick={() => { closeTeachPersona() }}>{t('teach.cancel')}</Button>
          <Button variant="primary" disabled={noRecorder} onClick={() => { setStep('source') }}>{t('teach.chooseSource')}</Button>
        </>
      ) : (
        <>
          <Button variant="ghost" disabled={busy} onClick={() => { setStep('consent'); setBeginFailed(false) }}>{t('teach.back')}</Button>
          <Button variant="primary" loading={busy} disabled={selectedId === null} onClick={begin}>{t('teach.begin')}</Button>
        </>
      )}
    >
      {step === 'consent' ? (
        <>
          {artSrc !== '' && (
            <p className={styles.art} aria-hidden="true">
              <img src={artSrc} alt="" width={160} height={160} />
            </p>
          )}
          <p>{t('teach.consentIntro', { name: personaName })}</p>
          <ul className={styles.consentList}>
            {CONSENT_LINES.map(row => (
              <li key={row.labelKey} className={styles.consentItem}>
                <span className={styles.consentIcon} aria-hidden="true">
                  <UiIcon name={row.icon} size={20} strokeWidth={2.2} />
                </span>
                <span>
                  <strong>{t(row.labelKey)}</strong>
                  {' '}
                  {t(row.bodyKey)}
                </span>
              </li>
            ))}
          </ul>
          <Notice tone="warning">{t('teach.recordingHint')}</Notice>
          <p className={styles.retention}>{t('teach.retention')}</p>
          {noRecorder && <Notice tone="info">{t('teach.needsDesktop')}</Notice>}
        </>
      ) : (
        <div className={flow.narrate}>
          <p className={flow.sourceNote}>{t('teach.sourceHint')}</p>
          {recorder?.kind === 'synthetic' && <Notice tone="info">{t('teach.exampleMode')}</Notice>}
          <Tabs
            idPrefix="persona-teach-source"
            label={t('teach.sourceTabs')}
            value={kind}
            onChange={(next) => { setKind(next); setSelectedId(null) }}
            items={[
              { id: 'screen', label: t('teach.sourceScreen') },
              { id: 'window', label: t('teach.sourceWindow') },
            ]}
          />
          {sources.status === 'loading' && <p className={flow.sourceNote} role="status">{t('teach.sourceLoading')}</p>}
          {sources.status === 'error' && (
            <>
              <p className={flow.sourceNote} role="alert">{t('teach.sourceError')}</p>
              <Button size="s" variant="secondary" onClick={loadSources}>{t('teach.sourceRetry')}</Button>
            </>
          )}
          {sources.status === 'ready' && shown.length === 0 && (
            <>
              <p className={flow.sourceNote}>{t('teach.sourceEmpty')}</p>
              <Button size="s" variant="secondary" onClick={loadSources}>{t('teach.sourceRetry')}</Button>
            </>
          )}
          {shown.length > 0 && (
            <fieldset className={flow.sourceList}>
              <legend className={flow.sourceLegend}>{t('teach.sourceList')}</legend>
              {shown.map(row => (
                <label key={row.id} className={flow.sourceOption} data-checked={selectedId === row.id ? '' : undefined}>
                  <input
                    type="radio"
                    className="persona-sr-only"
                    name="persona-teach-source"
                    value={row.id}
                    checked={selectedId === row.id}
                    onChange={() => { setSelectedId(row.id) }}
                  />
                  <span className={flow.sourceIcon} aria-hidden="true">
                    <UiIcon name={row.kind === 'window' ? 'file' : 'image'} size={20} strokeWidth={2} />
                  </span>
                  <span>{row.name}</span>
                </label>
              ))}
            </fieldset>
          )}
          {beginFailed && <p className={flow.failure} role="alert">{t('teach.beginFailed')}</p>}
        </div>
      )}
    </Modal>
  )
}

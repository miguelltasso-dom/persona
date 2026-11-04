/** WAVE2-SPEC §(b): consent only in Modal; capture/review use RecordingPill + Screen (Muse/Rivet). */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal } from '../primitives/index.ts'
import { teachIllustrationSrc } from './teach-art-key.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import type { ShellState } from '../shell/create-shell-store.ts'

const CONSENT_VERSION = 'teach-v1'

export interface TeachPersonaOverlayInjected {
  readonly dict: LocaleDict
  readonly persona: PersonaRemoteClient
  readonly hooks: {
    readonly shell: HostObservable<ShellState>
    readonly live: HostObservable<PersonaLiveSnapshot>
  }
  closeTeachPersona(): void
  /** Rivet: desktopCapturer + always-on-top frame after consent. */
  beginTeachCapture(personaId: string, consentVersion: string, microphone: boolean): void
}

export type TeachPersonaOverlayProps = InjectFace<TeachPersonaOverlayInjected>

export function TeachPersonaOverlay({
  dict,
  useShell,
  useLive,
  closeTeachPersona,
  beginTeachCapture,
}: TeachPersonaOverlayProps): ReactNode {
  const personaId = useShell(state => state.teachPersonaId)
  const team = useLive((state: PersonaLiveSnapshot) => state.team)
  const t = (key: string) => bindLocale(dict, key)
  const artSrc = teachIllustrationSrc(personaId, team)
  const open = personaId !== null
  const [microphone, setMicrophone] = useState(false)

  const reset = useCallback(() => {
    setMicrophone(false)
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  const chooseSource = (): void => {
    if (personaId === null) return
    beginTeachCapture(personaId, CONSENT_VERSION, microphone)
    closeTeachPersona()
  }

  if (!open) return null

  return (
    <Modal
      open
      size="m"
      title={t('teach.title')}
      onClose={() => { closeTeachPersona() }}
      footer={(
        <>
          <Button variant="ghost" onClick={() => { closeTeachPersona() }}>{t('teach.cancel')}</Button>
          <Button variant="primary" onClick={chooseSource}>{t('teach.chooseSource')}</Button>
        </>
      )}
    >
      {artSrc !== '' && (
        <p className="persona-teach-consent-art" aria-hidden="true">
          <img src={artSrc} alt="" width={160} height={160} />
        </p>
      )}
      <p>{t('teach.consentIntro')}</p>
      <ul>
        <li>{t('teach.consentScreen')}</li>
        <li>{t('teach.consentLocal')}</li>
        <li>{t('teach.consentPrivate')}</li>
      </ul>
      <p>{t('teach.recordingHint')}</p>
      <label>
        <input type="checkbox" checked={microphone} onChange={(e) => { setMicrophone(e.target.checked) }} />
        {' '}
        {t('teach.microphone')}
      </label>
    </Modal>
  )
}

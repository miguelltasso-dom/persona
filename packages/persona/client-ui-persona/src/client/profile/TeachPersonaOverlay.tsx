/** WAVE2-SPEC §(b): consent only in Modal; capture/review use RecordingPill + Screen (Muse/Rivet). */

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Modal, Notice, Switch, UiIcon } from '../primitives/index.ts'
import { teachIllustrationSrc } from './teach-art-key.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import styles from './TeachPersonaOverlay.module.css'

const CONSENT_VERSION = 'teach-v1'

const CONSENT_LINES = [
  { icon: 'image' as const, labelKey: 'teach.consentRecordedLabel', bodyKey: 'teach.consentScreen' },
  { icon: 'lock' as const, labelKey: 'teach.consentStoredLabel', bodyKey: 'teach.consentLocal' },
  { icon: 'eye' as const, labelKey: 'teach.consentWhoLabel', bodyKey: 'teach.consentPrivate' },
] as const

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
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const artSrc = teachIllustrationSrc(personaId, team)
  const open = personaId !== null
  const [microphone, setMicrophone] = useState(false)
  const micSwitchId = useId()

  const personaName = personaId === null || team === null
    ? t('teach.title')
    : (team.personas.find(row => row.id === personaId)?.name ?? t('teach.title'))

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
      title={t('teach.titleNamed', { name: personaName })}
      onClose={() => { closeTeachPersona() }}
      footer={(
        <>
          <Button variant="ghost" onClick={() => { closeTeachPersona() }}>{t('teach.cancel')}</Button>
          <Button variant="primary" onClick={chooseSource}>{t('teach.chooseSource')}</Button>
        </>
      )}
    >
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
      <div className={styles.micRow}>
        <span id={`${micSwitchId}-label`} className={styles.micLabel}>{t('teach.microphone')}</span>
        <Switch
          checked={microphone}
          labelledBy={`${micSwitchId}-label`}
          onChange={setMicrophone}
        />
      </div>
    </Modal>
  )
}

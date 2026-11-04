/** WAVE2: in-app recording chrome (RecordingPill) wired to Forge teach RPC; Rivet adds capture window later. */

import { useEffect, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { RecordingFrame, RecordingPill, type RecordingState } from '../primitives/index.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import type { ShellState } from '../shell/create-shell-store.ts'

export interface TeachCaptureState {
  readonly personaId: string
  readonly sessionId: string
  readonly microphone: boolean
}

export interface TeachPersonaSessionInjected {
  readonly dict: LocaleDict
  readonly live: PersonaLiveStore
  readonly hooks: { readonly shell: HostObservable<ShellState> }
  closeTeachCapture(): void
}

export type TeachPersonaSessionProps = InjectFace<TeachPersonaSessionInjected>

export function TeachPersonaSession({
  dict,
  live,
  useShell,
  closeTeachCapture,
}: TeachPersonaSessionProps): ReactNode {
  const capture = useShell(state => state.teachCapture)
  const team = live.observable.getSnapshot().team
  const persona = capture === null ? undefined : team?.personas.find(row => row.id === capture.personaId)
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [state, setState] = useState<RecordingState>('recording')
  const [elapsedSec, setElapsedSec] = useState(0)

  useEffect(() => {
    if (capture === null) return
    const tick = window.setInterval(() => {
      void live.getTeachSession(capture.sessionId).then((row) => {
        setState(row.status === 'paused' ? 'paused' : 'recording')
        setElapsedSec(Math.floor(row.elapsedMs / 1000))
      })
    }, 1000)
    return () => { window.clearInterval(tick) }
  }, [capture, live])

  if (capture === null || capture.sessionId === '') return null

  const name = persona?.name ?? capture.personaId
  const labels = {
    recording: t('teach.recording'),
    paused: t('teach.paused'),
    pause: t('teach.pause'),
    resume: t('teach.resume'),
    stop: t('teach.stop'),
    micOn: t('teach.microphoneOn'),
    micOff: t('teach.microphoneOff'),
    region: t('teach.recordingRegion'),
  }

  return (
    <div className="persona-teach-session" data-persona-root="">
      <RecordingFrame />
      <RecordingPill
        state={state}
        watchingText={t('teach.watching', { name })}
        personaName={name}
        elapsedSec={elapsedSec}
        labels={labels}
        onPause={() => { void live.pauseTeachSession(capture.sessionId) }}
        onResume={() => { void live.resumeTeachSession(capture.sessionId) }}
        onStop={() => {
          void live.stopTeachSession(capture.sessionId, capture.microphone).then(() => {
            closeTeachCapture()
          })
        }}
      />
    </div>
  )
}

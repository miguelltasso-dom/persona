/**
 * Item 20 (Muse §2–§3): the voice message in the thread — play/pause, the static waveform (heard part in brand), the duration,
 * the 1× · 1,5× · 2× speed and the one-line transcription with "ver tudo".
 *
 * The audio element is the browser's; the transcription is optional and never blocks playback (best-effort, as decided).
 */

import { useRef, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconButton, UiIcon } from '../primitives/index.ts'
import { formatVoiceTime, VOICE_BUBBLE_BARS, VOICE_SPEEDS, waveformBars, type VoiceSpeed } from './voice-model.ts'
import styles from './AudioBubble.module.css'

export type VoiceTranscription =
  | { readonly state: 'none' }
  | { readonly state: 'running' }
  | { readonly state: 'failed' }
  | { readonly state: 'needs-model' }
  | { readonly state: 'downloading' }
  | { readonly state: 'download-failed' }
  | { readonly state: 'done'; readonly text: string }

export interface AudioBubbleProps extends PropsLocale<'persona.shell'> {
  readonly src: string
  readonly durationMs: number
  /** Levels saved with the recording; absent = a flat waveform. */
  readonly levels?: readonly number[]
  readonly transcription?: VoiceTranscription
  /** Asked when the person presses "Transcrever"; absent = no transcription offered. */
  readonly onTranscribe?: () => void
}

export function AudioBubble({ t, src, durationMs, levels, transcription = { state: 'none' }, onTranscribe }: AudioBubbleProps): ReactNode {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [positionMs, setPositionMs] = useState(0)
  const [speed, setSpeed] = useState<VoiceSpeed>(1)
  const [expanded, setExpanded] = useState(false)
  const bars = waveformBars(levels ?? [], VOICE_BUBBLE_BARS)
  const heard = durationMs === 0 ? 0 : Math.min(1, positionMs / durationMs)

  const toggle = (): void => {
    const element = audio.current
    if (element === null) return
    if (playing) {
      element.pause()
      setPlaying(false)
      return
    }
    element.playbackRate = speed
    // jsdom (tests) has no media pipeline: `play()` answers undefined there, and that is not a failure of the bubble.
    const started: Promise<void> | undefined = element.play()
    if (started === undefined) {
      setPlaying(true)
      return
    }
    void started.then(() => { setPlaying(true) }).catch(() => { setPlaying(false) })
  }

  const cycleSpeed = (): void => {
    const next = VOICE_SPEEDS[(VOICE_SPEEDS.indexOf(speed) + 1) % VOICE_SPEEDS.length] ?? 1
    setSpeed(next)
    if (audio.current !== null) audio.current.playbackRate = next
  }

  return (
    <div className={styles.bubble} data-playing={playing}>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onTimeUpdate={(event) => { setPositionMs(event.currentTarget.currentTime * 1_000) }}
        onEnded={() => { setPlaying(false); setPositionMs(0) }}
      />
      <IconButton
        size="s"
        variant="secondary"
        label={playing ? t('voice.pause') : t('voice.play')}
        icon={<UiIcon name={playing ? 'pause' : 'play'} size={24} />}
        onClick={toggle}
      />
      <span className={styles.wave} aria-hidden="true">
        {bars.map((level, index) => (
          <span
            key={index}
            className={styles.tick}
            data-heard={index / bars.length < heard ? 'true' : 'false'}
            style={{ transform: `scaleY(${0.15 + level * 0.85})` }}
          />
        ))}
      </span>
      <span className={styles.time}>{formatVoiceTime(durationMs)}</span>
      <button type="button" className={styles.speed} aria-label={t('voice.speed')} onClick={cycleSpeed}>
        {speed === 1.5 ? '1,5×' : `${String(speed)}×`}
      </button>
      <TranscriptionLine t={t} transcription={transcription} expanded={expanded} onExpand={() => { setExpanded(value => !value) }} {...(onTranscribe === undefined ? {} : { onTranscribe })} />
    </div>
  )
}

interface TranscriptionLineProps extends PropsLocale<'persona.shell'> {
  readonly transcription: VoiceTranscription
  readonly expanded: boolean
  readonly onExpand: () => void
  readonly onTranscribe?: () => void
}

function TranscriptionLine({ t, transcription, expanded, onExpand, onTranscribe }: TranscriptionLineProps): ReactNode {
  if (transcription.state === 'running') return <p className={styles.transcription}>{t('voice.transcribing')}</p>
  if (transcription.state === 'downloading') return <p className={styles.transcription}>{t('voice.downloading')}</p>
  if (transcription.state === 'failed') return <p className={styles.transcription}>{t('voice.transcriptionFailed')}</p>
  if (transcription.state === 'download-failed') {
    return (
      <p className={styles.transcription}>
        {t('voice.downloadFailed')}
        {onTranscribe !== undefined && (
          <button type="button" className={styles.link} onClick={onTranscribe}>{t('voice.modelConsentAction')}</button>
        )}
      </p>
    )
  }
  if (transcription.state === 'needs-model') {
    return (
      <p className={styles.transcription}>
        {t('voice.modelConsent')}
        {onTranscribe !== undefined && (
          <button type="button" className={styles.link} onClick={onTranscribe}>{t('voice.modelConsentAction')}</button>
        )}
      </p>
    )
  }
  if (transcription.state === 'done') {
    return (
      <p className={styles.transcription} data-expanded={expanded}>
        <span className={styles.transcriptionText}>{transcription.text}</span>
        <button type="button" className={styles.link} onClick={onExpand}>{t('voice.showAll')}</button>
      </p>
    )
  }
  if (onTranscribe === undefined) return null
  return (
    <p className={styles.transcription}>
      <button type="button" className={styles.link} onClick={onTranscribe}>{t('voice.transcribe')}</button>
    </p>
  )
}

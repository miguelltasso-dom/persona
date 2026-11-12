/**
 * Item 20 (Muse §1): the recording bar that replaces the composer while a voice message is being recorded — blinking dot,
 * clock, live waveform (32 bars, height by `scaleY`), the 2-minute warning, Descartar and Enviar áudio.
 */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconButton, UiIcon } from '../primitives/index.ts'
import { formatVoiceTime, VOICE_LIVE_BARS, voiceBarHeight, voiceNearLimit, waveformBars } from './voice-model.ts'
import styles from './VoiceRecorderBar.module.css'

export interface VoiceRecorderBarProps extends PropsLocale<'persona.shell'> {
  /** Time since the recording started. */
  readonly elapsedMs: number
  /** Levels the analyser produced, 0–1, oldest first. */
  readonly levels: readonly number[]
  readonly onDiscard: () => void
  readonly onSend: () => void
}

export function VoiceRecorderBar({ t, elapsedMs, levels, onDiscard, onSend }: VoiceRecorderBarProps): ReactNode {
  const bars = waveformBars(levels, VOICE_LIVE_BARS)
  return (
    <div className={styles.bar} role="group" aria-label={t('voice.record')}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.time}>{formatVoiceTime(elapsedMs)}</span>
      <span className={styles.wave} aria-hidden="true" data-bars={bars.length}>
        {bars.map((level, index) => (
          <span key={index} className={styles.tick} style={{ transform: `scaleY(${voiceBarHeight(level) / 24})` }} />
        ))}
      </span>
      {voiceNearLimit(elapsedMs) && <span className={styles.limit} role="status">{t('voice.limit')}</span>}
      <IconButton size="s" variant="ghost" label={t('voice.discard')} icon={<UiIcon name="trash" size={24} />} onClick={onDiscard} />
      <IconButton size="m" variant="primary" label={t('voice.send')} icon={<UiIcon name="send" size={24} />} onClick={onSend} />
    </div>
  )
}

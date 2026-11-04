/**
 * "Ensinar a persona" (WAVE2 §2, WAVE2-SPEC (b)) — Muse primitives for Prism/Rivet.
 * RecordingPill: the discreet floating control while recording (overlay window, outside the recorded area).
 * RecordingFrame: corner-bracket frame around what is being recorded.
 * TeachStepCard: one step of the skill draft for review (thumbnail, editable text, reorder, blur, remove).
 */

import type { ReactNode } from 'react'
import { Avatar } from './Avatar.tsx'
import { Button, IconButton } from './Button.tsx'
import { Textarea } from './Field.tsx'
import { UiIcon } from './icons.tsx'
import styles from './Teach.module.css'

export type RecordingState = 'countdown' | 'recording' | 'paused'

export interface RecordingPillProps {
  readonly state: RecordingState
  /** "Nina está olhando" */
  readonly watchingText: string
  readonly personaName: string
  readonly portraitSrc?: string | undefined
  readonly elapsedSec: number
  /** 3 → 2 → 1 before the recording starts. */
  readonly countdown?: number | undefined
  /** "Falta 1 minuto" near the limit. */
  readonly warning?: string | undefined
  readonly microphone?: { readonly on: boolean; readonly onToggle: () => void } | undefined
  readonly labels: {
    readonly recording: string
    readonly paused: string
    readonly pause: string
    readonly resume: string
    readonly stop: string
    readonly micOn: string
    readonly micOff: string
    /** Region label: "Gravação em andamento" */
    readonly region: string
  }
  readonly onPause: () => void
  readonly onResume: () => void
  readonly onStop: () => void
}

export function formatElapsed(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export function RecordingPill({
  state,
  watchingText,
  personaName,
  portraitSrc,
  elapsedSec,
  countdown,
  warning,
  microphone,
  labels,
  onPause,
  onResume,
  onStop,
}: RecordingPillProps): ReactNode {
  const paused = state === 'paused'
  return (
    <div className={styles.pill} data-state={state} role="region" aria-label={labels.region}>
      <Avatar name={personaName} src={portraitSrc} size={24} shape="portrait" decorative />
      <span className={styles.watching}>{watchingText}</span>
      <span className={styles.status} role="status" aria-live="polite">
        <span className={styles.recDot} aria-hidden="true" />
        {state === 'countdown' ? (
          <span className={styles.countdown}>{countdown ?? 3}</span>
        ) : (
          <>
            <span className="persona-sr-only">{paused ? labels.paused : labels.recording}</span>
            <time className={styles.timer}>{formatElapsed(elapsedSec)}</time>
            {paused && <span className={styles.pausedText} aria-hidden="true">{labels.paused}</span>}
          </>
        )}
      </span>
      {warning !== undefined && <span className={styles.warning} role="alert">{warning}</span>}
      <span className={styles.controls}>
        {microphone !== undefined && (
          <IconButton
            size="s"
            variant="ghost"
            label={microphone.on ? labels.micOn : labels.micOff}
            aria-pressed={microphone.on}
            icon={<MicIcon off={!microphone.on} />}
            onClick={microphone.onToggle}
          />
        )}
        <Button size="s" variant="secondary" disabled={state === 'countdown'} onClick={paused ? onResume : onPause}>
          {paused ? labels.resume : labels.pause}
        </Button>
        <Button size="s" variant="primary" onClick={onStop}>{labels.stop}</Button>
      </span>
    </div>
  )
}

function MicIcon({ off }: { readonly off: boolean }): ReactNode {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  )
}

/** Corner-bracket frame around the recorded screen/window (fills its positioned parent). Decorative. */
export function RecordingFrame({ paused = false }: { readonly paused?: boolean }): ReactNode {
  return (
    <div className={styles.frame} data-paused={paused ? '' : undefined} aria-hidden="true">
      <span className={styles.corner} data-corner="tl" />
      <span className={styles.corner} data-corner="tr" />
      <span className={styles.corner} data-corner="bl" />
      <span className={styles.corner} data-corner="br" />
    </div>
  )
}

export interface TeachStepCardProps {
  /** 1-based. */
  readonly order: number
  readonly total: number
  readonly thumbnailSrc?: string | undefined
  readonly instruction: string
  /** "O que conferir" line. */
  readonly check?: string | undefined
  readonly onInstructionChange: (text: string) => void
  readonly onCheckChange?: ((text: string) => void) | undefined
  readonly onMove?: ((direction: -1 | 1) => void) | undefined
  readonly onRemove?: (() => void) | undefined
  /** Opens the blur tool on this thumbnail. */
  readonly onBlur?: (() => void) | undefined
  readonly onEnlarge?: (() => void) | undefined
  readonly labels: {
    /** "Passo {n}" already formatted. */
    readonly step: string
    readonly instruction: string
    readonly check: string
    readonly moveUp: string
    readonly moveDown: string
    readonly remove: string
    readonly blur: string
    readonly enlarge: string
    readonly noThumbnail: string
  }
}

export function TeachStepCard({
  order,
  total,
  thumbnailSrc,
  instruction,
  check,
  onInstructionChange,
  onCheckChange,
  onMove,
  onRemove,
  onBlur,
  onEnlarge,
  labels,
}: TeachStepCardProps): ReactNode {
  return (
    <li className={styles.step} aria-label={labels.step}>
      <span className={styles.badge} aria-hidden="true">{order}</span>
      <div className={styles.thumbWrap}>
        {thumbnailSrc !== undefined ? (
          <button type="button" className={styles.thumb} aria-label={labels.enlarge} onClick={onEnlarge} disabled={onEnlarge === undefined}>
            <img src={thumbnailSrc} alt="" draggable={false} />
          </button>
        ) : (
          <span className={styles.thumbEmpty}>{labels.noThumbnail}</span>
        )}
        {onBlur !== undefined && thumbnailSrc !== undefined && (
          <Button size="s" variant="ghost" className={styles.blur} onClick={onBlur}>{labels.blur}</Button>
        )}
      </div>
      <div className={styles.fields}>
        <Textarea label={labels.instruction} rows={2} value={instruction} onChange={(event) => { onInstructionChange(event.target.value) }} />
        {onCheckChange !== undefined && (
          <Textarea label={labels.check} rows={1} value={check ?? ''} onChange={(event) => { onCheckChange(event.target.value) }} />
        )}
      </div>
      <div className={styles.stepActions}>
        {onMove !== undefined && (
          <>
            <IconButton size="s" variant="ghost" label={labels.moveUp} disabled={order <= 1} icon={<UiIcon name="chevronDown" size={16} className={styles.up} />} onClick={() => { onMove(-1) }} />
            <IconButton size="s" variant="ghost" label={labels.moveDown} disabled={order >= total} icon={<UiIcon name="chevronDown" size={16} />} onClick={() => { onMove(1) }} />
          </>
        )}
        {onRemove !== undefined && (
          <IconButton size="s" variant="ghost" label={labels.remove} icon={<UiIcon name="close" size={16} />} onClick={onRemove} />
        )}
      </div>
    </li>
  )
}

/** Ordered list wrapper for TeachStepCard. */
export function TeachStepList({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactNode {
  return <ol className={styles.steps} aria-label={label}>{children}</ol>
}

/**
 * Item 20 (Muse §1–§2): the numbers of a voice message — the 2-minute cap, the clock, the live/static waveform and the playback
 * speeds. Pure, so the bar and the bubble share one truth and the tests need no microphone.
 */

/** Hard cap of one voice message (Muse §1: "Máximo de 2 minutos"). */
export const VOICE_MAX_MS = 120_000

/** From here the bar says the cap is near (Muse §1: "A partir de 1:45"). */
export const VOICE_WARN_MS = 105_000

/** Bars of the live waveform (Muse §1) and of the static one in the bubble (Muse §2). */
export const VOICE_LIVE_BARS = 32
export const VOICE_BUBBLE_BARS = 40

/** Playback speeds of the bubble (Muse §2). */
export const VOICE_SPEEDS = [1, 1.5, 2] as const
export type VoiceSpeed = (typeof VOICE_SPEEDS)[number]

/**
 * `m:ss` for a duration in milliseconds.
 * @param ms - Duration, clamped at zero.
 */
export function formatVoiceTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1_000))
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Resample the levels the analyser produced into exactly `count` bars, each 0–1. The last sample wins when the recording is
 * shorter than the bar count (the bar keeps a live shape instead of padding with silence).
 * @param levels - Raw 0–1 levels, oldest first.
 * @param count - Bars wanted.
 */
export function waveformBars(levels: readonly number[], count: number): readonly number[] {
  if (count <= 0) return []
  if (levels.length === 0) return Array.from({ length: count }, () => 0)
  const bars: number[] = []
  for (let index = 0; index < count; index += 1) {
    const at = Math.min(levels.length - 1, Math.floor((index / count) * levels.length))
    bars.push(Math.min(1, Math.max(0, levels[at] ?? 0)))
  }
  return bars
}

/** Whether the bar must show the "Máximo de 2 minutos" warning. */
export function voiceNearLimit(elapsedMs: number): boolean {
  return elapsedMs >= VOICE_WARN_MS
}

/** The bar height of one waveform sample: 4 to 24 px (Muse §1). */
export function voiceBarHeight(level: number): number {
  return 4 + Math.min(1, Math.max(0, level)) * 20
}

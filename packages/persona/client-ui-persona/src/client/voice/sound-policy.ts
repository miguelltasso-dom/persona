/**
 * Item 20 (Muse §4): when a cue may play. Pure and clock-injected, so the rules are testable without audio or a browser.
 *
 * The rules, in order: the person turned the sounds on; a first gesture happened in the window (browsers refuse audio before it);
 * no silence window is open; a direct message does not ring while its conversation is open and focused; and at most one cue
 * every two seconds, whatever happens.
 */

import type { PersonaSound } from './sound-score.ts'

/** Minimum spacing between two cues, whatever the event. */
export const SOUND_MIN_GAP_MS = 2_000

export interface SoundGate {
  /** The person's switch (Configurações › Aparência). */
  readonly enabled: boolean
  /** A first gesture (click/key) already happened in this window. */
  readonly gesture: boolean
  /** Now, in epoch milliseconds. */
  readonly now: number
  /** When the last cue started, if any. */
  readonly lastPlayedAt?: number
  /** Inside one of the team's silence windows. */
  readonly quiet: boolean
  /** The direct-message conversation of the cue is open and focused. */
  readonly conversationFocused: boolean
}

/**
 * Whether this cue may play now.
 * @param kind - Which cue the event asks for.
 * @param gate - The person's switch and the window's state.
 */
export function mayPlay(kind: PersonaSound, gate: SoundGate): boolean {
  if (!gate.enabled || !gate.gesture || gate.quiet) return false
  if (kind === 'dm' && gate.conversationFocused) return false
  return gate.lastPlayedAt === undefined || gate.now - gate.lastPlayedAt >= SOUND_MIN_GAP_MS
}

/** The person's volume choice: two steps, low by default (Muse §4). */
export type SoundVolume = 'low' | 'medium'

/** Gain multiplier applied on top of each note's own gain. */
export const SOUND_VOLUME_GAIN: Readonly<Record<SoundVolume, number>> = { low: 0.35, medium: 0.7 }

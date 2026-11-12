/**
 * Item 20 (Muse §4): the seam between the app's events and the player. The shell owns the events (delivery ready, confirmation
 * asked, new DM, sent, failed); this owns the rules and the audio, so the shell only calls `notify(kind)` where the event already
 * exists.
 */

import { mayPlay, type SoundGate } from './sound-policy.ts'
import { createSoundPlayer, type SoundPlayer } from './sound-player.ts'
import type { PersonaSound } from './sound-score.ts'
import { readSoundVolume, readSoundsEnabled } from './sounds-preference.ts'

export interface SoundEffectsOptions {
  /** Injected in tests; the real one is WebAudio. */
  readonly player?: SoundPlayer
  readonly now?: () => number
  /** The person's switch, read at every cue (Configurações › Aparência). */
  readonly enabled?: () => boolean
}

export interface SoundEffects {
  /** The first click/key in the window: browsers only allow audio after it. */
  gesture(): void
  /** An event happened; the rules decide whether it is heard. */
  notify(kind: PersonaSound): void
  /** The team's silence window opened or closed. */
  setQuiet(quiet: boolean): void
  /** The direct-message conversation of the cue is open and focused. */
  setConversationFocused(focused: boolean): void
  dispose(): void
}

/**
 * Build the sound effects for one window.
 * @param options - Player, clock and switch source (tests inject them).
 */
export function createSoundEffects(options: SoundEffectsOptions = {}): SoundEffects {
  const player = options.player ?? createSoundPlayer({ volume: readSoundVolume })
  const now = options.now ?? Date.now
  const enabled = options.enabled ?? readSoundsEnabled
  let gestured = false
  let quiet = false
  let conversationFocused = false
  let lastPlayedAt: number | undefined
  return {
    gesture() { gestured = true },
    notify(kind) {
      const gate: SoundGate = { enabled: enabled(), gesture: gestured, now: now(), quiet, conversationFocused, ...(lastPlayedAt === undefined ? {} : { lastPlayedAt }) }
      if (!mayPlay(kind, gate)) return
      lastPlayedAt = gate.now
      player.play(kind)
    },
    setQuiet(next) { quiet = next },
    setConversationFocused(next) { conversationFocused = next },
    dispose() { player.close() },
  }
}

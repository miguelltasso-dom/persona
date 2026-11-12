/**
 * Item 20 (Muse §4): the five discrete sounds, synthesized in our own code — no audio files, nothing added to the installer.
 *
 * A score is data, not a player: the tests read it without an audio device, and the player only applies it to a WebAudio
 * context. Kept short (each note 40–120 ms, a whole cue under half a second) and low: these play while the person works.
 */

export type PersonaSound = 'delivery' | 'confirm' | 'dm' | 'sent' | 'error'

export interface SoundNote {
  /** Start of the note inside the cue, in milliseconds. */
  readonly atMs: number
  readonly durationMs: number
  /** Hz. */
  readonly frequency: number
  /** Relative gain of this note, 0–1; the player applies the person's volume on top. */
  readonly gain: number
  readonly wave: OscillatorType
}

/** Cues from Muse §4: entrega pronta, pedido de confirmação, mensagem nova em DM, enviado e algo deu errado. */
export const SOUND_SCORES: Readonly<Record<PersonaSound, readonly SoundNote[]>> = {
  // A short rise: something landed.
  delivery: [
    { atMs: 0, durationMs: 90, frequency: 523.25, gain: 0.5, wave: 'triangle' },
    { atMs: 95, durationMs: 110, frequency: 659.25, gain: 0.45, wave: 'triangle' },
  ],
  // A question shape (up, held): the team needs you.
  confirm: [
    { atMs: 0, durationMs: 80, frequency: 659.25, gain: 0.45, wave: 'sine' },
    { atMs: 85, durationMs: 130, frequency: 783.99, gain: 0.4, wave: 'sine' },
  ],
  // One soft ping, higher: a direct message.
  dm: [
    { atMs: 0, durationMs: 70, frequency: 880, gain: 0.35, wave: 'sine' },
  ],
  // The quietest of the five: the person's own message left.
  sent: [
    { atMs: 0, durationMs: 45, frequency: 659.25, gain: 0.22, wave: 'sine' },
  ],
  // A fall: something failed.
  error: [
    { atMs: 0, durationMs: 100, frequency: 440, gain: 0.4, wave: 'triangle' },
    { atMs: 105, durationMs: 130, frequency: 349.23, gain: 0.35, wave: 'triangle' },
  ],
}

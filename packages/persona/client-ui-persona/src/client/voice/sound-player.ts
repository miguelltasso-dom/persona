/**
 * Item 20 (Muse §4): plays a cue on WebAudio, synthesized on the spot — no audio files, nothing added to the installer.
 *
 * The context is built on the first cue, never at mount: browsers refuse audio before a gesture, and the policy only lets a cue
 * through after one. The structural types below are the slice of WebAudio this uses, so the scheduler is testable without an
 * audio device.
 */

import { SOUND_SCORES, type PersonaSound } from './sound-score.ts'
import { SOUND_VOLUME_GAIN, type SoundVolume } from './sound-policy.ts'

interface SoundParam {
  value: number
  setValueAtTime(value: number, when: number): unknown
  linearRampToValueAtTime(value: number, when: number): unknown
  exponentialRampToValueAtTime(value: number, when: number): unknown
}

interface SoundOscillator {
  type: OscillatorType
  frequency: SoundParam
  connect(node: unknown): unknown
  start(when: number): void
  stop(when: number): void
}

interface SoundGain {
  gain: SoundParam
  connect(node: unknown): unknown
}

/** The WebAudio surface the player uses; a real `AudioContext` satisfies it. */
export interface SoundAudioContext {
  readonly state: AudioContextState
  readonly currentTime: number
  readonly destination: unknown
  resume(): Promise<void>
  close(): Promise<void>
  createOscillator(): SoundOscillator
  createGain(): SoundGain
}

export interface SoundPlayer {
  play(kind: PersonaSound): void
  close(): void
}

export interface SoundPlayerOptions {
  /** The person's volume choice, read at play time. */
  readonly volume: () => SoundVolume
  /** Builds the context on the first cue. Default: a real `AudioContext`. */
  readonly createContext?: () => SoundAudioContext
}

/**
 * Schedule one cue on the context.
 * @param context - Audio context (real or a test double).
 * @param kind - Which cue.
 * @param volume - The person's volume choice.
 */
export function scheduleSound(context: SoundAudioContext, kind: PersonaSound, volume: SoundVolume): void {
  const start = context.currentTime
  const gainScale = SOUND_VOLUME_GAIN[volume]
  for (const note of SOUND_SCORES[kind]) {
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = note.wave
    oscillator.frequency.value = note.frequency
    const at = start + note.atMs / 1_000
    const end = at + note.durationMs / 1_000
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(note.gain * gainScale, at + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(at)
    oscillator.stop(end + 0.01)
  }
}

/**
 * A player that builds its context lazily and never throws when audio is unavailable.
 * @param options - Volume source and context factory.
 */
export function createSoundPlayer(options: SoundPlayerOptions): SoundPlayer {
  let context: SoundAudioContext | undefined
  return {
    play(kind) {
      try {
        context ??= (options.createContext ?? (() => new AudioContext()))()
        if (context.state === 'suspended') void context.resume()
        scheduleSound(context, kind, options.volume())
      } catch (error) {
        // No audio device (or the browser refused it): a cue is never worth an error in the person's face.
        void error
      }
    },
    close() {
      void context?.close()
    },
  }
}

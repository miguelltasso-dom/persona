/**
 * Item 20 (Muse §4): the person's choice for the discrete sounds. Local, like the sticker preference: no host round-trip.
 */

import type { SoundVolume } from './sound-policy.ts'

export const SOUNDS_ENABLED_KEY = 'persona.sounds.enabled.v1'
export const SOUNDS_VOLUME_KEY = 'persona.sounds.volume.v1'

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** On by default: the person turns it off, not on (Muse §4). */
export function readSoundsEnabled(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try {
    return storage?.getItem(SOUNDS_ENABLED_KEY) !== '0'
  } catch {
    return true
  }
}

export function writeSoundsEnabled(enabled: boolean, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(SOUNDS_ENABLED_KEY, enabled ? '1' : '0')
  } catch {
    // Storage unavailable: the choice lasts this session only.
  }
}

/** Low by default (Muse §4). */
export function readSoundVolume(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): SoundVolume {
  try {
    return storage?.getItem(SOUNDS_VOLUME_KEY) === 'medium' ? 'medium' : 'low'
  } catch {
    return 'low'
  }
}

export function writeSoundVolume(volume: SoundVolume, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(SOUNDS_VOLUME_KEY, volume)
  } catch {
    // Storage unavailable: the choice lasts this session only.
  }
}

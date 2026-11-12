// @vitest-environment jsdom
/**
 * Item 20 (Muse §3): the voice model is downloaded only after the person presses "Baixar agora"; the consent is stored on this
 * machine and read before the first transcription.
 */

import { describe, expect, it } from 'vitest'
import { grantVoiceModelConsent, voiceModelConsentGranted } from '../src/client/voice/voice-model-consent.ts'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => { values.clear() },
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('o consentimento do pacote de voz', () => {
  it('começa sem consentimento e passa a concedido depois do Baixar agora', () => {
    const storage = memoryStorage()
    expect(voiceModelConsentGranted(storage)).toBe(false)
    grantVoiceModelConsent(storage)
    expect(voiceModelConsentGranted(storage)).toBe(true)
  })

  it('cada armazenamento tem o seu consentimento', () => {
    const mine = memoryStorage()
    grantVoiceModelConsent(mine)
    expect(voiceModelConsentGranted(memoryStorage())).toBe(false)
  })

  it('sem armazenamento não há consentimento e gravar não lança', () => {
    expect(voiceModelConsentGranted(undefined)).toBe(false)
    expect(() => { grantVoiceModelConsent(undefined) }).not.toThrow()
  })
})

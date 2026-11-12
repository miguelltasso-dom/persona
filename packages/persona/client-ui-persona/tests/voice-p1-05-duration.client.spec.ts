// COLHEITA-S1 · P1-05 (Carbon) · Keel 04:46: a duração da bolha sai do nome do anexo (voz-<segundos>s.webm), sem mudar o host.
import { describe, expect, it } from 'vitest'
import { durationFromAttachmentName } from '../src/client/chat/voice-compose/attachment-audio.ts'
import { voiceAttachmentName } from '../src/client/voice/voice-send.ts'

describe('P1-05 · duração no nome do anexo de voz', () => {
  it('voz-<segundos>s.webm (ou .ogg) dá a duração em ms', () => {
    expect(durationFromAttachmentName('voz-12s.webm')).toBe(12_000)
    expect(durationFromAttachmentName('voz-3s.ogg')).toBe(3_000)
  })

  it('outro nome (anexo antigo ou de outro app) não tem duração', () => {
    expect(durationFromAttachmentName('foto.png')).toBeUndefined()
    expect(durationFromAttachmentName('audio-4s.webm')).toBeUndefined()
    expect(durationFromAttachmentName('voz-s.webm')).toBeUndefined()
  })

  it('o nome que a gravação gera é o que a bolha lê', () => {
    expect(durationFromAttachmentName(voiceAttachmentName(7, 'audio/webm'))).toBe(7_000)
    expect(voiceAttachmentName(7, 'audio/ogg')).toBe('voz-7s.ogg')
    expect(voiceAttachmentName(7, 'audio/webm')).toBe('voz-7s.webm')
  })
})

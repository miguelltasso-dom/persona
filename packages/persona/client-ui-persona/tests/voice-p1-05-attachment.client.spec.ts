// @vitest-environment jsdom
/**
 * COLHEITA-S1 · P1-05 (Carbon): a bolha de áudio no fio. Vermelho primeiro. Keel 04:11: o metadado (mime) vem de getAttachment;
 * os bytes (base64) só de getAttachmentBytes e só ao tocar; cache por id; nada de bytes de todas as mensagens ao abrir o fio.
 */
import { describe, expect, it, vi } from 'vitest'
import { isAudioMime, resolveAudioAttachment } from '../src/client/chat/voice-compose/attachment-audio.ts'

describe('P1-05 · tipo de áudio', () => {
  it('só os tipos de áudio que o navegador toca passam', () => {
    expect(isAudioMime('audio/webm')).toBe(true)
    expect(isAudioMime('audio/ogg')).toBe(true)
    expect(isAudioMime('audio/mp4')).toBe(true)
    expect(isAudioMime('image/png')).toBe(false)
    expect(isAudioMime('text/html')).toBe(false)
  })
})

describe('P1-05 · anexo de áudio: metadados primeiro, bytes depois', () => {
  it('pede o metadado; se não for áudio, não pede os bytes', async () => {
    const remote = {
      getAttachment: vi.fn(async () => ({ id: 'att-9', name: 'foto.png', mime: 'image/png', bytes: 10, hash: 'h', credentialWarning: false, messageId: 'm' })),
      getAttachmentBytes: vi.fn(async () => ({ id: 'att-9', name: 'foto.png', mime: 'image/png', bytesBase64: 'AAAA' })),
    }
    const result = await resolveAudioAttachment(remote, { workspaceId: 'ws', projectId: 'pp' }, 'att-9')
    expect(result).toBeNull()
    expect(remote.getAttachmentBytes).not.toHaveBeenCalled()
  })

  it('para áudio, devolve o mime e os bytes base64 (uma vez por id)', async () => {
    const remote = {
      getAttachment: vi.fn(async () => ({ id: 'att-1', name: 'audio-4s.webm', mime: 'audio/webm', bytes: 3, hash: 'h', credentialWarning: false, messageId: 'm' })),
      getAttachmentBytes: vi.fn(async () => ({ id: 'att-1', name: 'audio-4s.webm', mime: 'audio/webm', bytesBase64: 'YWJj' })),
    }
    const scope = { workspaceId: 'ws', projectId: 'pp' }
    const first = await resolveAudioAttachment(remote, scope, 'att-1')
    const second = await resolveAudioAttachment(remote, scope, 'att-1')
    expect(first).toEqual({ mime: 'audio/webm', bytesBase64: 'YWJj' })
    expect(second).toEqual(first)
    expect(remote.getAttachment).toHaveBeenCalledTimes(1)
    expect(remote.getAttachmentBytes).toHaveBeenCalledTimes(1)
  })
})

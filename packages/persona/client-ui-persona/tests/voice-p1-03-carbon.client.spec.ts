// COLHEITA-S1 · P1-03 (Carbon): a voz é transcrita ANTES de enviar. Vermelho primeiro: hoje o envio sobe com corpo vazio (''), sem
// nenhum transcritor chamado. Sem transcrição disponível, nada é postado e o resultado diz "unavailable".
import { describe, expect, it, vi } from 'vitest'
import { sendVoiceAfterTranscription } from '../src/client/voice/voice-send.ts'

const recording = { blob: new Blob(['abc'], { type: 'audio/webm' }), durationMs: 2_000 }

function targetWith() {
  return {
    uploadChannelAttachment: vi.fn(async () => ({ id: 'a1', name: 'voz-2s.webm' })),
    uploadDmAttachment: vi.fn(async () => ({ id: 'a1', name: 'voz-2s.webm' })),
    postChannelMessage: vi.fn(async (_body: string, _ids?: readonly string[]) => undefined),
    postDmMessage: vi.fn(async (_body: string, _ids?: readonly string[]) => undefined),
  }
}

describe('P1-03 · voz: transcreve antes de enviar', () => {
  it('sem transcrição, nada é postado (nada de corpo vazio) e o resultado diz "unavailable"', async () => {
    const target = targetWith()
    const outcome = await sendVoiceAfterTranscription(target as never, recording as never, 'channel', async () => undefined)
    expect(outcome).toEqual({ status: 'unavailable' })
    expect(target.uploadChannelAttachment).not.toHaveBeenCalled()
    expect(target.postChannelMessage).not.toHaveBeenCalled()
  })

  it('com transcrição, o texto vai no corpo, junto com o áudio', async () => {
    const target = targetWith()
    const outcome = await sendVoiceAfterTranscription(target as never, recording as never, 'channel', async () => 'Pode me ajudar?')
    expect(outcome).toEqual({ status: 'sent' })
    expect(target.postChannelMessage).toHaveBeenCalledWith('Pode me ajudar?', ['a1'])
  })

  it('na DM, a mesma regra: sem transcrição não posta; com transcrição posta na DM', async () => {
    const blocked = targetWith()
    expect(await sendVoiceAfterTranscription(blocked as never, recording as never, 'dm', async () => undefined)).toEqual({ status: 'unavailable' })
    expect(blocked.postDmMessage).not.toHaveBeenCalled()
    const sent = targetWith()
    expect(await sendVoiceAfterTranscription(sent as never, recording as never, 'dm', async () => 'oi')).toEqual({ status: 'sent' })
    expect(sent.postDmMessage).toHaveBeenCalledWith('oi', ['a1'])
  })
})

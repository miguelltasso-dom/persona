// @vitest-environment jsdom
/**
 * Item 20 (Keel, 00:08): the real transcriber drives vosk-browser's worker — the model is loaded once from the Host's bytes, one
 * recognizer reads one message, the finalized segments are joined in order, and every failure ends as a rejection the bubble already
 * maps to "não deu". The digits of the model never come from the network here: the bytes are the Host's.
 */

import { describe, expect, it, vi } from 'vitest'
import { createVoskTranscriber, type DecodedAudio, type VoskMessage, type VoskModel, type VoskModule, type VoskRecognizer } from '../src/client/voice/voice-transcriber.ts'

type Handler = (message: VoskMessage) => void

interface Fake {
  readonly vosk: VoskModule
  readonly calls: string[]
  readonly revoked: string[]
}

/** A vosk module whose recognizer runs `script` when the audio arrives. */
function fakeVosk(script: (emit: (message: VoskMessage) => void) => void): Fake {
  const calls: string[] = []
  const revoked: string[] = []
  const handlers = new Map<string, Handler[]>()
  const emit = (message: VoskMessage): void => {
    for (const handler of handlers.get(message.event) ?? []) handler(message)
  }
  class KaldiRecognizer implements VoskRecognizer {
    constructor(sampleRate: number) {
      void sampleRate
    }

    on(event: 'result' | 'partialresult' | 'error', handler: Handler): void {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
    }

    acceptWaveformFloat(): void {
      calls.push('accept')
      script(emit)
    }

    retrieveFinalResult(): void {
      calls.push('retrieve')
    }

    remove(): void {
      calls.push('recognizer.remove')
    }
  }
  const model: VoskModel = {
    terminate: () => { calls.push('model.terminate') },
    KaldiRecognizer,
  }
  URL.createObjectURL = () => {
    const url = `blob:model-${String(calls.length)}`
    calls.push(`createObjectURL:${url}`)
    return url
  }
  URL.revokeObjectURL = (url: string) => { revoked.push(url) }
  return {
    vosk: {
      createModel: async (url) => {
        calls.push(`createModel:${url}`)
        return model
      },
    },
    calls,
    revoked,
  }
}

const audio: DecodedAudio = { samples: new Float32Array([0, 0, 0]), sampleRate: 16_000 }
const decode = (): Promise<DecodedAudio> => Promise.resolve(audio)
const recording = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })

function transcriber(fake: Fake, timing: { timeoutMs?: number; settleMs?: number; idleMs?: number } = {}, version = 'v1') {
  return createVoskTranscriber(new ArrayBuffer(8), version, {
    loadVosk: () => Promise.resolve(fake.vosk),
    decode,
    timeoutMs: timing.timeoutMs ?? 1_000,
    settleMs: timing.settleMs ?? 5,
    idleMs: timing.idleMs ?? 10_000,
  })
}

describe('o transcritor de voz (vosk no Worker)', () => {
  it('junta os trechos finalizados em ordem e devolve o texto', async () => {
    const fake = fakeVosk((emit) => {
      emit({ event: 'result', result: { text: 'olá' } })
      emit({ event: 'partialresult', result: { partial: 'olá' } })
      emit({ event: 'result', result: { text: 'padaria lua' } })
    })
    const text = await transcriber(fake, {}, 'v1').transcribe(recording, 1_000)
    expect(text).toBe('olá padaria lua')
    expect(fake.calls.filter(call => call === 'createModel:blob:model-0')).toHaveLength(1)
    expect(fake.calls).toContain('accept')
    expect(fake.calls).toContain('retrieve')
  })

  it('o modelo fica quente entre mensagens e é liberado depois da janela ociosa', async () => {
    vi.useFakeTimers()
    try {
      const fake = fakeVosk((emit) => { emit({ event: 'result', result: { text: 'oi' } }) })
      const voice = transcriber(fake, { idleMs: 50 }, 'v2')
      const first = voice.transcribe(recording, 1_000)
      await vi.advanceTimersByTimeAsync(20)
      expect(await first).toBe('oi')
      const second = voice.transcribe(recording, 1_000)
      await vi.advanceTimersByTimeAsync(20)
      expect(await second).toBe('oi')
      expect(fake.calls.filter(call => call.startsWith('createModel:'))).toHaveLength(1)
      fake.revoked.length = 0
      voice.close()
      expect(fake.calls).not.toContain('model.terminate')
      await vi.advanceTimersByTimeAsync(60)
      expect(fake.calls).toContain('model.terminate')
      expect(fake.revoked).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('uma versão nova troca o modelo e libera o antigo', async () => {
    const first = fakeVosk((emit) => { emit({ event: 'result', result: { text: 'um' } }) })
    const second = fakeVosk((emit) => { emit({ event: 'result', result: { text: 'dois' } }) })
    const one = transcriber(first, { idleMs: 10_000 }, 'v3')
    expect(await one.transcribe(recording, 1_000)).toBe('um')
    const two = transcriber(second, { idleMs: 10_000 }, 'v4')
    expect(await two.transcribe(recording, 1_000)).toBe('dois')
    expect(first.calls).toContain('model.terminate')
    expect(second.calls.filter(call => call.startsWith('createModel:'))).toHaveLength(1)
  })

  it('um erro do worker vira falha, não texto', async () => {
    const fake = fakeVosk((emit) => { emit({ event: 'error', error: 'quebrou' }) })
    await expect(transcriber(fake, {}, 'v5').transcribe(recording, 1_000)).rejects.toThrow('quebrou')
  })

  it('um worker que nunca responde estoura no prazo', async () => {
    const fake = fakeVosk(() => undefined)
    await expect(transcriber(fake, { timeoutMs: 30, settleMs: 5 }, 'v6').transcribe(recording, 1_000)).rejects.toThrow('timeout')
  })
})

// @vitest-environment jsdom
/**
 * COLHEITA-S1 · P1-05 (Carbon): o timer ocioso do transcritor. Vermelho primeiro: a janela ociosa da transcrição anterior
 * não pode terminar o modelo de uma transcrição nova que já começou (hoje o timer é global e não é cancelado ao começar).
 */
import { describe, expect, it } from 'vitest'
import { createVoskTranscriber, type DecodedAudio, type VoskMessage, type VoskModel, type VoskModule, type VoskRecognizer } from '../src/client/voice/voice-transcriber.ts'

const audio: DecodedAudio = { samples: new Float32Array([0, 0, 0]), sampleRate: 16_000 }
const recording = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })

/** Um vosk falso cujo resultado chega `timing.delayMs` depois do áudio (muda entre as duas transcrições). */
function fakeVosk(timing: { delayMs: number }) {
  const calls: string[] = []
  class KaldiRecognizer implements VoskRecognizer {
    private readonly handlers = new Map<string, ((message: VoskMessage) => void)[]>()

    constructor(sampleRate: number) {
      void sampleRate
    }

    on(event: 'result' | 'partialresult' | 'error', handler: (message: VoskMessage) => void): void {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
    }

    acceptWaveformFloat(): void {
      calls.push('accept')
      setTimeout(() => {
        for (const handler of this.handlers.get('result') ?? []) handler({ event: 'result', result: { text: 'ola' } })
      }, timing.delayMs)
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
  let counter = 0
  URL.createObjectURL = () => {
    counter += 1
    return `blob:p105-${String(counter)}`
  }
  URL.revokeObjectURL = () => undefined
  return { calls, vosk: { createModel: async () => model } as unknown as VoskModule }
}

describe('P1-05 · transcritor: o timer ocioso não mata uma transcrição em curso', () => {
  it('a janela ociosa da transcrição anterior não termina o modelo enquanto a nova ainda roda', async () => {
    const timing = { delayMs: 0 }
    const fake = fakeVosk(timing)
    const transcriber = createVoskTranscriber(new ArrayBuffer(8), 'p105-idle', {
      loadVosk: () => Promise.resolve(fake.vosk),
      decode: () => Promise.resolve(audio),
      timeoutMs: 2_000,
      settleMs: 5,
      idleMs: 40,
    })
    // 1ª transcrição: fecha depressa e deixa a janela ociosa (40 ms) correndo.
    await transcriber.transcribe(recording, 2_000)
    // 2ª transcrição: começa logo depois, na mesma instância quente, e demora mais que a janela ociosa.
    timing.delayMs = 120
    const second = transcriber.transcribe(recording, 2_000)
    await new Promise<void>((resolve) => { setTimeout(resolve, 80) })
    expect(fake.calls).not.toContain('model.terminate')
    await second
    expect(fake.calls).not.toContain('model.terminate')
  })
})

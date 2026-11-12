// @vitest-environment jsdom
/**
 * Item 20: a transcrição é best-effort — o áudio já foi enviado; o modelo baixa no consentimento, o worker roda em segundo plano
 * e toda falha termina num estado que o balão já sabe mostrar.
 */

import { describe, expect, it } from 'vitest'
import { transcribeVoice, type VoiceTranscriber } from '../src/client/voice/voice-transcribe.ts'
import type { VoiceTranscription } from '../src/client/voice/AudioBubble.tsx'
import type { VoiceModelState } from '../src/client/voice/voice-model-host.ts'

const RECORDING = { blob: new Blob(['abc'], { type: 'audio/webm' }), durationMs: 3_000 }

function transcriber(text: string, fail = false) {
  const calls: string[] = []
  const worker: VoiceTranscriber = {
    transcribe: async () => {
      calls.push('transcribe')
      if (fail) throw new Error('worker morreu')
      return text
    },
    close: () => { calls.push('close') },
  }
  return { worker, calls }
}

describe('a transcrição da mensagem de voz', () => {
  it('baixa o modelo, transcreve e devolve o texto, fechando o worker', async () => {
    const states: VoiceTranscription[] = []
    const { worker, calls } = transcriber('  bom dia  ')
    const result = await transcribeVoice(RECORDING, {
      loadModel: async (options) => {
        options.onDownloading?.()
        return { state: 'ready', bytes: new ArrayBuffer(4), version: 'v1' }
      },
      createTranscriber: () => worker,
      onState: (state) => { states.push(state) },
    })
    expect(result).toEqual({ state: 'done', text: 'bom dia' })
    expect(states.map(state => state.state)).toEqual(['downloading', 'running', 'done'])
    expect(calls).toEqual(['transcribe', 'close'])
  })

  it('modelo já em cache não mostra "baixando"', async () => {
    const states: VoiceTranscription[] = []
    const result = await transcribeVoice(RECORDING, {
      loadModel: async () => ({ state: 'ready', bytes: new ArrayBuffer(4), version: 'v1' }),
      createTranscriber: () => transcriber('oi').worker,
      onState: (state) => { states.push(state) },
    })
    expect(result).toEqual({ state: 'done', text: 'oi' })
    expect(states.map(state => state.state)).toEqual(['running', 'done'])
  })

  it('sem o modelo, termina em download-failed e não cria worker', async () => {
    const states: VoiceTranscription[] = []
    let built = 0
    const result = await transcribeVoice(RECORDING, {
      loadModel: async (): Promise<VoiceModelState> => ({ state: 'failed', reason: 'offline' }),
      createTranscriber: () => { built += 1; return transcriber('x').worker },
      onState: (state) => { states.push(state) },
    })
    expect(result).toEqual({ state: 'download-failed' })
    expect(built).toBe(0)
    expect(states.map(state => state.state)).toEqual(['download-failed'])
  })

  it('worker que falha ou devolve vazio termina em failed, sem erro na cara da pessoa', async () => {
    const { worker, calls } = transcriber('', true)
    const failed = await transcribeVoice(RECORDING, {
      loadModel: async () => ({ state: 'ready', bytes: new ArrayBuffer(4), version: 'v1' }),
      createTranscriber: () => worker,
    })
    expect(failed).toEqual({ state: 'failed' })
    expect(calls).toEqual(['transcribe', 'close'])
    const empty = await transcribeVoice(RECORDING, {
      loadModel: async () => ({ state: 'ready', bytes: new ArrayBuffer(4), version: 'v1' }),
      createTranscriber: () => transcriber('   ').worker,
    })
    expect(empty).toEqual({ state: 'failed' })
  })

  it('um worker que nem constrói não derruba a mensagem', async () => {
    const result = await transcribeVoice(RECORDING, {
      loadModel: async () => ({ state: 'ready', bytes: new ArrayBuffer(4), version: 'v1' }),
      createTranscriber: () => { throw new Error('sem wasm') },
    })
    expect(result).toEqual({ state: 'failed' })
  })
})

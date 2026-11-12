// COLHEITA-S1 · P1-03 (Carbon; Keel 10:08): o transcritor real. O microfone só aparece com modelo pronto ou baixável; com o host
// indisponível o transcritor não tem texto (o envio fica bloqueado, nunca corpo vazio). Sem o modelo, nada de Vosk nesta suíte.
import { describe, expect, it, vi } from 'vitest'
import type { VoiceModelHost } from '../src/client/voice/voice-model-host.ts'
import { micAvailableFor, productionVoiceTranscriber } from '../src/client/voice/voice-production.ts'

function hostReporting(state: unknown): VoiceModelHost {
  return {
    voiceModelState: async () => state as never,
    ensureVoiceModel: async () => ({ state: 'failed', reason: 'unavailable' }) as never,
  }
}

describe('P1-03 · o microfone só com modelo pronto ou baixável', () => {
  it('instalado (pronto) e ausente (baixável) mostram o microfone', () => {
    expect(micAvailableFor({ state: 'installed', version: 'v1' })).toBe(true)
    expect(micAvailableFor({ state: 'absent' })).toBe(true)
  })

  it('indisponível ou com falha escondem o microfone', () => {
    expect(micAvailableFor({ state: 'unavailable' })).toBe(false)
    expect(micAvailableFor({ state: 'failed', reason: 'offline' } as never)).toBe(false)
  })
})

describe('P1-03 · transcritor real sem modelo: nada de texto', () => {
  it('host indisponível: não há transcrição (undefined), e o envio fica bloqueado', async () => {
    const transcribe = productionVoiceTranscriber(hostReporting({ state: 'unavailable' }))
    const recording = { blob: new Blob(['abc'], { type: 'audio/webm' }), durationMs: 2_000, levels: [] }
    expect(await transcribe(recording)).toBeUndefined()
  })

  // Keel 10:29: no 1º uso o modelo baixa; o transcritor avisa a tela ("Baixando o ouvido da Persona (1ª vez)…") antes de baixar.
  it('modelo ausente (1º uso): avisa o download antes de tentar, e sem o modelo não há texto', async () => {
    const onDownloading = vi.fn()
    const transcribe = productionVoiceTranscriber(hostReporting({ state: 'absent' }))
    const recording = { blob: new Blob(['abc'], { type: 'audio/webm' }), durationMs: 2_000, levels: [] }
    expect(await transcribe(recording, { onDownloading })).toBeUndefined()
    expect(onDownloading).toHaveBeenCalledTimes(1)
  })
})

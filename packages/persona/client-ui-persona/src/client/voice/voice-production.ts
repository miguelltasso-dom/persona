/**
 * COLHEITA-S1 P1-03 (Carbon; Keel 10:08): o transcritor REAL da voz. Liga o pipeline que já existia (modelo pelo host, cache, Vosk) ao
 * envio. O microfone aparece quando o modelo está instalado (pronto) ou pode ser baixado (baixável); some quando indisponível ou com
 * falha. Sem transcrição, o envio fica bloqueado com aviso (nunca corpo vazio).
 */
import type { VoiceModelHost, VoiceModelHostState } from './voice-model-host.ts'
import type { VoiceRecording } from './useVoiceCapture.ts'
import type { VoiceTranscribe, VoiceTranscribeHooks } from './voice-send.ts'
import { transcribeVoice } from './voice-transcribe.ts'
import { createVoskTranscriber } from './voice-transcriber.ts'

/** Pronto ou baixável: o microfone aparece. Indisponível ou com falha: some (a voz não vai pela metade no Setup). */
export function micAvailableFor(state: VoiceModelHostState): boolean {
  return state.state === 'installed' || state.state === 'absent'
}

/**
 * @param host - A ponte do host (`voiceModelState` e `ensureVoiceModel`).
 * @returns O transcritor de produção: texto quando deu certo; `undefined` quando não há transcrição.
 */
export function productionVoiceTranscriber(host: VoiceModelHost): VoiceTranscribe {
  return async (recording: VoiceRecording, hooks?: VoiceTranscribeHooks): Promise<string | undefined> => {
    const onDownloading = hooks?.onDownloading
    const result = await transcribeVoice(recording, {
      createTranscriber: (bytes, version) => createVoskTranscriber(bytes, version),
      model: onDownloading === undefined ? { host } : { host, onDownloading },
    })
    return result.state === 'done' ? result.text : undefined
  }
}

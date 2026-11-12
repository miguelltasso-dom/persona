/**
 * Item 20 (Keel, 22:53): transcription is best-effort and never blocks the audio. This is the seam the bubble drives: the model
 * is loaded on consent, the worker transcribes in the background, and every failure ends as a state the bubble already knows —
 * the voice message stays sent either way.
 */

import type { VoiceTranscription } from './AudioBubble.tsx'
import { loadVoiceModel, type VoiceModelOptions, type VoiceModelState } from './voice-model-host.ts'

/** What runs the model (the WASM worker in production; a double in tests). */
export interface VoiceTranscriber {
  transcribe(blob: Blob, durationMs: number): Promise<string>
  close(): void
}

export interface VoiceTranscribeOptions {
  /** Loads the pinned model; default {@link loadVoiceModel}. */
  readonly loadModel?: (options: VoiceModelOptions) => Promise<VoiceModelState>
  /** Builds the transcriber from the verified model bytes and its version. */
  readonly createTranscriber: (model: ArrayBuffer, version: string) => VoiceTranscriber
  /** Progress and states for the bubble. */
  readonly onState?: (state: VoiceTranscription) => void
  readonly model?: VoiceModelOptions
}

/**
 * Transcribe one recorded message.
 * @param recording - The audio the capture produced.
 * @param options - Model loader, worker factory and state sink.
 * @returns The final transcription state; never throws.
 */
export async function transcribeVoice(
  recording: { readonly blob: Blob; readonly durationMs: number },
  options: VoiceTranscribeOptions,
): Promise<VoiceTranscription> {
  const load = options.loadModel ?? loadVoiceModel
  let transcriber: VoiceTranscriber | undefined
  try {
    // "Baixando o pacote de voz…" belongs to the install, not to every message: a cached model goes straight to "Transcrevendo…".
    const model = await load({
      ...options.model,
      onDownloading: () => {
        options.model?.onDownloading?.()
        options.onState?.({ state: 'downloading' })
      },
    })
    if (model.state !== 'ready') {
      const failed: VoiceTranscription = { state: 'download-failed' }
      options.onState?.(failed)
      return failed
    }
    options.onState?.({ state: 'running' })
    transcriber = options.createTranscriber(model.bytes, model.version)
    const text = await transcriber.transcribe(recording.blob, recording.durationMs)
    const done: VoiceTranscription = text.trim() === '' ? { state: 'failed' } : { state: 'done', text: text.trim() }
    options.onState?.(done)
    return done
  } catch (error) {
    // A worker that dies (or a model that cannot load) is a transcript that did not happen, not an error in the person's face.
    void error
    const failed: VoiceTranscription = { state: 'failed' }
    options.onState?.(failed)
    return failed
  } finally {
    transcriber?.close()
  }
}

/**
 * Item 20 (Keel, 00:19): the real transcriber — vosk-browser's WASM inside its own Worker, loaded only when the person asks for a
 * transcript (the library is ~5.8 MB, so the import is dynamic and never part of the first paint). The model arrives from the Host as
 * the official `model.tar.gz`; the recording is decoded here and handed to the recognizer as mono float samples. Nothing leaves the
 * machine, and the audio keeps playing while this runs.
 *
 * The model stays warm between messages (loading it costs seconds) and is released after an idle window or when the Host installs a
 * new version.
 */

import type { VoiceTranscriber } from './voice-transcribe.ts'

/** One recognizer of the worker: the events it reports and the two calls this file makes. */
export interface VoskRecognizer {
  on(event: 'result' | 'partialresult' | 'error', listener: (message: VoskMessage) => void): void
  acceptWaveformFloat(buffer: Float32Array, sampleRate: number): void
  retrieveFinalResult(): void
  remove(): void
}

/** What the worker reports: a finalized segment, a partial one, or why it gave up. */
export type VoskMessage =
  | { readonly event: 'result'; readonly result: { readonly text: string } }
  | { readonly event: 'partialresult'; readonly result: { readonly partial: string } }
  | { readonly event: 'error'; readonly error: string }

/** The loaded model: it owns the worker and hands out recognizers. */
export interface VoskModel {
  readonly KaldiRecognizer: new (sampleRate: number) => VoskRecognizer
  terminate(): void
}

/** The module surface this file uses; a test replaces it. */
export interface VoskModule {
  createModel(modelUrl: string): Promise<VoskModel>
}

/** Decoded mono audio: the samples and the rate they were recorded at (the recognizer resamples). */
export interface DecodedAudio {
  readonly samples: Float32Array
  readonly sampleRate: number
}

/** What the transcriber needs from the browser; every field has a production default. */
export interface VoiceTranscriberDeps {
  /** Loads vosk-browser; default is a dynamic import so the bundle only arrives on demand. */
  readonly loadVosk?: () => Promise<VoskModule>
  /** Decodes a recorded blob to mono samples; default uses `AudioContext.decodeAudioData`. */
  readonly decode?: (blob: Blob) => Promise<DecodedAudio>
  /** How long one transcript may take before it counts as failed. */
  readonly timeoutMs?: number
  /** Quiet window after the last recognizer event that closes the transcript. */
  readonly settleMs?: number
  /** How long the loaded model stays warm after the last message. */
  readonly idleMs?: number
}

interface WarmModel {
  readonly version: string
  readonly url: string
  readonly model: Promise<VoskModel>
}

let warm: WarmModel | undefined
let idle: number | undefined

function releaseWarm(): void {
  if (warm === undefined) return
  const current = warm
  warm = undefined
  URL.revokeObjectURL(current.url)
  void current.model.then((model) => { model.terminate() }).catch(() => undefined)
}

function scheduleIdle(idleMs: number): void {
  window.clearTimeout(idle)
  idle = window.setTimeout(releaseWarm, idleMs)
}

/**
 * Decode any recording the browser can play into mono float samples at its own rate.
 * @param blob - The recorded audio.
 * @returns Samples and rate.
 */
export async function decodeRecording(blob: Blob): Promise<DecodedAudio> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const mono = new Float32Array(decoded.length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel)
      for (let index = 0; index < data.length; index += 1) mono[index] = (mono[index] ?? 0) + (data[index] ?? 0) / decoded.numberOfChannels
    }
    return { samples: mono, sampleRate: decoded.sampleRate }
  } finally {
    await context.close()
  }
}

/**
 * Build the transcriber the bubble drives; the model worker is shared by every message of the same version.
 * @param modelBytes - The `model.tar.gz` the Host handed over.
 * @param version - Model version; a different version replaces the warm worker.
 * @param deps - Test seams (module loader, decoder, timings).
 * @returns The transcriber; `transcribe` never leaves a recognizer behind.
 */
export function createVoskTranscriber(
  modelBytes: ArrayBuffer,
  version: string,
  deps: VoiceTranscriberDeps = {},
): VoiceTranscriber {
  const loadVosk = deps.loadVosk ?? ((): Promise<VoskModule> => import('./vosk-module.ts'))
  const decode = deps.decode ?? decodeRecording
  const timeoutMs = deps.timeoutMs ?? 120_000
  const settleMs = deps.settleMs ?? 600
  const idleMs = deps.idleMs ?? 120_000
  let recognizer: VoskRecognizer | undefined

  const model = async (): Promise<VoskModel> => {
    if (warm !== undefined && warm.version === version) return warm.model
    releaseWarm()
    const url = URL.createObjectURL(new Blob([modelBytes], { type: 'application/gzip' }))
    const loading = loadVosk()
      .then(vosk => vosk.createModel(url))
      .catch((error: unknown) => {
        if (warm !== undefined && warm.url === url) releaseWarm()
        throw error
      })
    warm = { version, url, model: loading }
    return loading
  }

  const close = (): void => {
    try {
      recognizer?.remove()
    } catch (error) {
      void error
    }
    recognizer = undefined
    scheduleIdle(idleMs)
  }

  return {
    close,
    transcribe: async (blob) => {
      const loaded = await model()
      const audio = await decode(blob)
      const active = new loaded.KaldiRecognizer(audio.sampleRate)
      recognizer = active
      const { promise, resolve, reject } = Promise.withResolvers<string>()
      const parts: string[] = []
      let settled = false
      const fail = (message: string): void => {
        if (settled) return
        settled = true
        reject(new Error(message))
      }
      const finish = (): void => {
        if (settled) return
        settled = true
        resolve(parts.join(' ').trim())
      }
      let quiet: number | undefined
      let deadline: number | undefined
      const stopTimers = (): void => {
        window.clearTimeout(deadline)
        window.clearTimeout(quiet)
      }
      deadline = window.setTimeout(() => { stopTimers(); fail('timeout') }, timeoutMs)
      // The worker answers in order: every segment it finalized, then the tail `retrieveFinalResult` asks for. A short quiet window
      // after the last event is what tells "the recognizer is done" apart from "more segments are coming".
      const settle = (): void => {
        window.clearTimeout(quiet)
        quiet = window.setTimeout(() => { stopTimers(); finish() }, settleMs)
      }
      active.on('result', (message) => {
        if (message.event !== 'result') return
        if (message.result.text !== '') parts.push(message.result.text)
        settle()
      })
      active.on('partialresult', () => { settle() })
      active.on('error', (message) => {
        if (message.event === 'error') { stopTimers(); fail(message.error) }
      })
      active.acceptWaveformFloat(audio.samples, audio.sampleRate)
      active.retrieveFinalResult()
      const text = await promise
      try {
        active.remove()
      } catch (error) {
        void error
      }
      recognizer = undefined
      scheduleIdle(idleMs)
      return text
    },
  }
}

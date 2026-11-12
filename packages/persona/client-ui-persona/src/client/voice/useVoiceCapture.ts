/**
 * Item 20 (Muse §1): captures one voice message — microphone, MediaRecorder, the live levels of the waveform and the 2-minute
 * cap. The composer owns the buttons; this owns the capture, and the browser APIs are injectable so the rules are testable
 * without a microphone.
 */

import { useEffect, useRef, useState } from 'react'
import { VOICE_MAX_MS } from './voice-model.ts'

/** The slice of MediaRecorder this uses (a real one satisfies it). */
export interface VoiceRecorderLike {
  readonly mimeType: string
  start(timeslice?: number): void
  stop(): void
  ondataavailable: ((event: { readonly data: Blob }) => void) | null
  onstop: (() => void) | null
}

/** One 0–1 loudness reading of the live microphone. */
export interface VoiceLevels {
  sample(): number
  close(): void
}

/** The slice of a capture stream this uses; a real `MediaStream` satisfies it. */
export interface VoiceStream {
  getTracks(): readonly { stop(): void }[]
}

export interface VoiceCaptureOptions {
  /** Cap of one message; default {@link VOICE_MAX_MS}. */
  readonly maxMs?: number
  readonly now?: () => number
  readonly getUserMedia?: (constraints: MediaStreamConstraints) => Promise<VoiceStream>
  readonly createRecorder?: (stream: VoiceStream) => VoiceRecorderLike
  readonly createLevels?: (stream: VoiceStream) => VoiceLevels
  /** How often the clock and the waveform are refreshed. */
  readonly tickMs?: number
  /** Called when the 2-minute cap ends the recording by itself (the composer sends it). */
  readonly onComplete?: (recording: VoiceRecording) => void
}

export interface VoiceRecording {
  readonly blob: Blob
  readonly durationMs: number
  readonly levels: readonly number[]
}

export interface VoiceCapture {
  readonly state: 'idle' | 'recording'
  readonly elapsedMs: number
  readonly levels: readonly number[]
  start(): Promise<void>
  /** Ends the recording and hands it back; undefined when nothing was recording. */
  stop(): Promise<VoiceRecording | undefined>
  cancel(): void
}

interface Session {
  readonly stream: VoiceStream
  readonly recorder: VoiceRecorderLike
  readonly levels: VoiceLevels
  readonly chunks: Blob[]
  readonly startedAt: number
  readonly samples: number[]
  /** Clears the clock/waveform interval; set right after the session exists. */
  stopTimer: () => void
}

/** The real microphone sampler: an AnalyserNode's RMS, 0–1. */
function realLevels(stream: VoiceStream): VoiceLevels {
  const context = new AudioContext()
  // The browser boundary: the structural stream is a real MediaStream here.
  const source = context.createMediaStreamSource(stream as MediaStream)
  const analyser = context.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const buffer = new Float32Array(analyser.fftSize)
  return {
    sample() {
      analyser.getFloatTimeDomainData(buffer)
      let sum = 0
      for (const value of buffer) sum += value * value
      return Math.min(1, Math.sqrt(sum / buffer.length) * 4)
    },
    close() {
      source.disconnect()
      void context.close()
    },
  }
}

/**
 * One recording session.
 * @param options - Injectable browser APIs (tests) and the cap.
 */
export function useVoiceCapture(options: VoiceCaptureOptions = {}): VoiceCapture {
  const maxMs = options.maxMs ?? VOICE_MAX_MS
  const now = options.now ?? Date.now
  const tickMs = options.tickMs ?? 100
  const [state, setState] = useState<'idle' | 'recording'>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [levels, setLevels] = useState<readonly number[]>([])
  const session = useRef<Session | null>(null)
  // P1-05: a permissão do microfone pode chegar depois de a tela sair; `alive` e `asking` impedem fluxo solto e pedido duplicado.
  const alive = useRef(true)
  const asking = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      const current = session.current
      if (current === null) return
      current.stopTimer()
      current.levels.close()
      for (const track of current.stream.getTracks()) track.stop()
      session.current = null
    }
  }, [])

  const release = (current: Session): void => {
    current.stopTimer()
    current.levels.close()
    for (const track of current.stream.getTracks()) track.stop()
    session.current = null
    setState('idle')
    setElapsedMs(0)
  }

  const finish = (current: Session): VoiceRecording => {
    const durationMs = Math.min(maxMs, now() - current.startedAt)
    const blob = new Blob(current.chunks, { type: current.recorder.mimeType === '' ? 'audio/webm' : current.recorder.mimeType })
    const recording = { blob, durationMs, levels: [...current.samples] }
    release(current)
    setLevels([])
    return recording
  }

  const stop = async (): Promise<VoiceRecording | undefined> => {
    const current = session.current
    if (current === null) return undefined
    return new Promise<VoiceRecording>((resolve) => {
      current.recorder.onstop = () => { resolve(finish(current)) }
      current.recorder.stop()
    })
  }

  const start = async (): Promise<void> => {
    if (session.current !== null || asking.current) return
    const media = options.getUserMedia ?? ((constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints))
    asking.current = true
    let stream: VoiceStream
    try {
      stream = await media({ audio: true })
    } catch (error) {
      asking.current = false
      throw error
    }
    asking.current = false
    // A tela saiu enquanto o navegador pedia permissão: o fluxo que chegou agora não tem dono; solta as faixas.
    if (!alive.current) {
      for (const track of stream.getTracks()) track.stop()
      return
    }
    const createRecorder = options.createRecorder
    const recorder: VoiceRecorderLike = createRecorder === undefined
      ? new MediaRecorder(stream as MediaStream) as VoiceRecorderLike
      : createRecorder(stream)
    const levels = (options.createLevels ?? realLevels)(stream)
    const current: Session = { stream, recorder, levels, chunks: [], startedAt: now(), samples: [], stopTimer: () => {} }
    recorder.ondataavailable = (event) => { if (event.data.size > 0) current.chunks.push(event.data) }
    const timer = setInterval(() => {
      const elapsed = now() - current.startedAt
      setElapsedMs(Math.min(maxMs, elapsed))
      current.samples.push(levels.sample())
      setLevels([...current.samples])
      // The cap ends the recording by itself; the composer sends what was captured.
      if (elapsed >= maxMs) {
        current.recorder.onstop = () => { options.onComplete?.(finish(current)) }
        current.recorder.stop()
      }
    }, tickMs)
    current.stopTimer = () => { clearInterval(timer) }
    session.current = current
    setState('recording')
    recorder.start()
  }

  const cancel = (): void => {
    const current = session.current
    if (current === null) return
    current.recorder.onstop = null
    current.recorder.stop()
    release(current)
    setLevels([])
  }

  return { state, elapsedMs, levels, start, stop, cancel }
}

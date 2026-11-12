// @vitest-environment jsdom
/**
 * Item 20: the capture hook — microphone, chunks, levels, the 2-minute cap and cancel, with the browser APIs injected.
 */

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useVoiceCapture, type VoiceLevels, type VoiceRecorderLike, type VoiceRecording, type VoiceStream } from '../src/client/voice/useVoiceCapture.ts'

function fakeStream() {
  const stopped: number[] = []
  const stream: VoiceStream = { getTracks: () => [{ stop: () => { stopped.push(1) } }] }
  return { stream, stopped }
}

function fakeRecorder() {
  let data: ((event: { readonly data: Blob }) => void) | null = null
  let stop: (() => void) | null = null
  const recorder: VoiceRecorderLike = {
    mimeType: 'audio/webm',
    start: () => undefined,
    stop: () => {
      data?.({ data: new Blob(['abc']) })
      stop?.()
    },
    get ondataavailable() { return data },
    set ondataavailable(next) { data = next },
    get onstop() { return stop },
    set onstop(next) { stop = next },
  }
  return recorder
}

function fakeLevels(level = 0.5) {
  const levels: VoiceLevels = { sample: () => level, close: () => undefined }
  return levels
}

async function tick(ms: number): Promise<void> {
  await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, ms) }) })
}

describe('a captura da mensagem de voz', () => {
  it('grava, amostra a onda e devolve o áudio com a duração', async () => {
    const { stream, stopped } = fakeStream()
    const recorder = fakeRecorder()
    const { result } = renderHook(() => useVoiceCapture({
      getUserMedia: async () => stream,
      createRecorder: () => recorder,
      createLevels: () => fakeLevels(0.7),
      tickMs: 5,
    }))
    await act(async () => { await result.current.start() })
    expect(result.current.state).toBe('recording')
    await tick(25)
    expect(result.current.levels.length).toBeGreaterThan(0)
    let recording: VoiceRecording | undefined
    await act(async () => { recording = await result.current.stop() })
    expect(recording?.blob.size).toBeGreaterThan(0)
    expect(recording?.durationMs).toBeGreaterThan(0)
    expect(recording?.levels.length).toBeGreaterThan(0)
    expect(result.current.state).toBe('idle')
    expect(stopped).toHaveLength(1)
  })

  it('descartar não devolve áudio e solta o microfone', async () => {
    const { stream, stopped } = fakeStream()
    const { result } = renderHook(() => useVoiceCapture({
      getUserMedia: async () => stream,
      createRecorder: () => fakeRecorder(),
      createLevels: () => fakeLevels(),
      tickMs: 5,
    }))
    await act(async () => { await result.current.start() })
    act(() => { result.current.cancel() })
    expect(result.current.state).toBe('idle')
    expect(stopped).toHaveLength(1)
    expect(result.current.levels).toEqual([])
  })

  it('o teto de duração encerra sozinho e entrega o áudio', async () => {
    const { stream } = fakeStream()
    const done = vi.fn()
    const { result } = renderHook(() => useVoiceCapture({
      getUserMedia: async () => stream,
      createRecorder: () => fakeRecorder(),
      createLevels: () => fakeLevels(),
      maxMs: 15,
      tickMs: 5,
      onComplete: done,
    }))
    await act(async () => { await result.current.start() })
    await tick(40)
    expect(done).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('idle')
  })
})

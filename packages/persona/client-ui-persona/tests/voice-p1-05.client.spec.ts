// @vitest-environment jsdom
/**
 * COLHEITA-S1 · P1-05 (Carbon): o microfone e a mensagem de voz. Testes VERMELHOS primeiro (reproduzem o bug), depois o conserto.
 * - O microfone fica aberto quando a tela desmonta durante a gravação ou enquanto o navegador ainda pede permissão.
 * - Um segundo `start()` durante a permissão abre um segundo fluxo de áudio.
 * - A mensagem de voz vai ao fio com a transcrição no corpo, junto do áudio (hoje vai `body: ''`).
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sendVoiceMessage } from '../src/client/voice/voice-send.ts'
import { useVoiceCapture, type VoiceLevels, type VoiceRecorderLike, type VoiceRecording, type VoiceStream } from '../src/client/voice/useVoiceCapture.ts'

function trackedStream() {
  const stopped: number[] = []
  const stream: VoiceStream = { getTracks: () => [{ stop: () => { stopped.push(1) } }] }
  return { stream, stopped }
}

function quietRecorder(): VoiceRecorderLike {
  let data: ((event: { readonly data: Blob }) => void) | null = null
  let stop: (() => void) | null = null
  return {
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
}

const levels: VoiceLevels = { sample: () => 0.5, close: () => undefined }

describe('P1-05 · microfone', () => {
  it('desmontar a tela no meio da gravação solta o microfone', async () => {
    const { stream, stopped } = trackedStream()
    const { result, unmount } = renderHook(() => useVoiceCapture({
      getUserMedia: async () => stream,
      createRecorder: () => quietRecorder(),
      createLevels: () => levels,
      tickMs: 10,
    }))
    await act(async () => { await result.current.start() })
    expect(result.current.state).toBe('recording')
    unmount()
    expect(stopped.length).toBeGreaterThan(0)
  })

  it('desmontar enquanto o navegador ainda pede permissão: o fluxo que chega depois é solto', async () => {
    const { stream, stopped } = trackedStream()
    let grant: ((value: VoiceStream) => void) | undefined
    const { result, unmount } = renderHook(() => useVoiceCapture({
      getUserMedia: () => new Promise<VoiceStream>((resolve) => { grant = resolve }),
      createRecorder: () => quietRecorder(),
      createLevels: () => levels,
    }))
    let started: Promise<void> | undefined
    act(() => { started = result.current.start() })
    unmount()
    await act(async () => {
      grant?.(stream)
      await started
    })
    expect(stopped.length).toBeGreaterThan(0)
  })

  it('dois start() durante a permissão pedem o microfone uma vez só', async () => {
    let asked = 0
    const { stream } = trackedStream()
    const { result } = renderHook(() => useVoiceCapture({
      getUserMedia: async () => { asked += 1; return stream },
      createRecorder: () => quietRecorder(),
      createLevels: () => levels,
      tickMs: 10,
    }))
    await act(async () => {
      await Promise.all([result.current.start(), result.current.start()])
    })
    expect(asked).toBe(1)
  })
})

describe('P1-05 · mensagem de voz', () => {
  it('a transcrição vai no corpo da mensagem, junto do áudio', async () => {
    const posted: { body: string; ids: readonly string[] | undefined }[] = []
    const target = {
      uploadChannelAttachment: async () => ({ id: 'att-1', name: 'audio.webm' }),
      uploadDmAttachment: async () => ({ id: 'att-2', name: 'audio.webm' }),
      postChannelMessage: async (body: string, ids?: readonly string[]) => { posted.push({ body, ids }) },
      postDmMessage: async (body: string, ids?: readonly string[]) => { posted.push({ body, ids }) },
    }
    const recording: VoiceRecording = { blob: new Blob(['abc'], { type: 'audio/webm' }), durationMs: 4_000, levels: [] }
    await sendVoiceMessage(target, recording, 'channel', { transcript: 'Oi, tudo bem?' })
    expect(posted).toEqual([{ body: 'Oi, tudo bem?', ids: ['att-1'] }])
  })
})

// @vitest-environment jsdom
/**
 * COLHEITA-S1 · P1-05 (Carbon): o microfone não aparece em nenhuma tela. Vermelho primeiro: o botão de gravar só existe
 * com o composer vazio; gravando, a barra de gravação toma o lugar do composer.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { VoiceComposeButton } from '../src/client/chat/voice-compose/VoiceComposeButton.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import type { VoiceLevels, VoiceRecorderLike, VoiceStream } from '../src/client/voice/useVoiceCapture.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

function fakeStream(): VoiceStream {
  return { getTracks: () => [{ stop: () => undefined }] }
}

function fakeRecorder(): VoiceRecorderLike {
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

const levels: VoiceLevels = { sample: () => 0.4, close: () => undefined }
const captureOptions = {
  getUserMedia: async () => fakeStream(),
  createRecorder: () => fakeRecorder(),
  createLevels: () => levels,
  tickMs: 10,
}

describe('P1-05 · microfone no composer', () => {
  it('com o composer vazio, o botão de gravar aparece; com texto, não', () => {
    const { rerender } = render(<VoiceComposeButton t={t} empty onSendVoice={() => undefined} captureOptions={captureOptions} />)
    expect(screen.getByRole('button', { name: bindLocale(shellPt, 'voice.record') })).toBeTruthy()
    rerender(<VoiceComposeButton t={t} empty={false} onSendVoice={() => undefined} captureOptions={captureOptions} />)
    expect(screen.queryByRole('button', { name: bindLocale(shellPt, 'voice.record') })).toBeNull()
  })

  it('gravando, a barra de gravação toma o lugar do botão e tem o botão de enviar áudio', async () => {
    render(<VoiceComposeButton t={t} empty onSendVoice={() => undefined} captureOptions={captureOptions} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: bindLocale(shellPt, 'voice.record') }))
    })
    expect(screen.getByRole('button', { name: bindLocale(shellPt, 'voice.send') })).toBeTruthy()
  })
})

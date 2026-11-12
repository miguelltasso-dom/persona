// @vitest-environment jsdom
/**
 * Item 20: the numbers of the voice message and the two components (recording bar and audio bubble).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatVoiceTime, VOICE_MAX_MS, VOICE_WARN_MS, voiceBarHeight, voiceNearLimit, waveformBars } from '../src/client/voice/voice-model.ts'
import { VoiceRecorderBar } from '../src/client/voice/VoiceRecorderBar.tsx'
import { AudioBubble } from '../src/client/voice/AudioBubble.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { sendVoiceMessage, type VoiceSendTarget } from '../src/client/voice/voice-send.ts'

const t = (key: string) => bindLocale(shellPt, key)

afterEach(() => { cleanup() })

describe('os números da mensagem de voz', () => {
  it('mostra o tempo como m:ss', () => {
    expect(formatVoiceTime(0)).toBe('0:00')
    expect(formatVoiceTime(7_400)).toBe('0:07')
    expect(formatVoiceTime(65_000)).toBe('1:05')
    expect(formatVoiceTime(-10)).toBe('0:00')
  })

  it('o aviso dos dois minutos aparece a partir de 1:45', () => {
    expect(voiceNearLimit(VOICE_WARN_MS - 1)).toBe(false)
    expect(voiceNearLimit(VOICE_WARN_MS)).toBe(true)
    expect(VOICE_MAX_MS).toBe(120_000)
  })

  it('a onda tem sempre o número de barras pedido, entre 0 e 1', () => {
    expect(waveformBars([], 4)).toEqual([0, 0, 0, 0])
    expect(waveformBars([0.2, 0.9], 4)).toEqual([0.2, 0.2, 0.9, 0.9])
    expect(waveformBars([2, -1], 2)).toEqual([1, 0])
    expect(waveformBars([0.5], 0)).toEqual([])
  })

  it('a altura da barra vai de 4 a 24 px', () => {
    expect(voiceBarHeight(0)).toBe(4)
    expect(voiceBarHeight(1)).toBe(24)
    expect(voiceBarHeight(2)).toBe(24)
  })
})

describe('a barra de gravação', () => {
  it('mostra o ponto, o tempo, 32 barras e os dois botões', () => {
    const { container } = render(<VoiceRecorderBar t={t} elapsedMs={7_000} levels={[0.4, 0.8]} onDiscard={() => undefined} onSend={() => undefined} />)
    expect(screen.getByText('0:07')).toBeTruthy()
    expect(container.querySelectorAll('[data-bars] > span')).toHaveLength(32)
    expect(screen.getByRole('button', { name: t('voice.discard') })).toBeTruthy()
    expect(screen.getByRole('button', { name: t('voice.send') })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('avisa o máximo a partir de 1:45 e chama descartar/enviar', () => {
    const onDiscard = vi.fn()
    const onSend = vi.fn()
    render(<VoiceRecorderBar t={t} elapsedMs={VOICE_WARN_MS} levels={[]} onDiscard={onDiscard} onSend={onSend} />)
    expect(screen.getByRole('status').textContent).toBe(t('voice.limit'))
    fireEvent.click(screen.getByRole('button', { name: t('voice.discard') }))
    fireEvent.click(screen.getByRole('button', { name: t('voice.send') }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})

describe('o balão de áudio', () => {
  it('mostra a duração, a onda de 40 barras e a velocidade 1×', () => {
    const { container } = render(<AudioBubble t={t} src="blob:audio" durationMs={12_000} levels={[0.5]} />)
    expect(screen.getByText('0:12')).toBeTruthy()
    expect(container.querySelectorAll('[data-heard]')).toHaveLength(40)
    expect(screen.getByRole('button', { name: t('voice.speed') }).textContent).toBe('1×')
  })

  it('cicla a velocidade 1× → 1,5× → 2×', () => {
    render(<AudioBubble t={t} src="blob:audio" durationMs={12_000} />)
    const speed = screen.getByRole('button', { name: t('voice.speed') })
    fireEvent.click(speed)
    expect(speed.textContent).toBe('1,5×')
    fireEvent.click(speed)
    expect(speed.textContent).toBe('2×')
    fireEvent.click(speed)
    expect(speed.textContent).toBe('1×')
  })

  it('toca e pausa pelo botão, mesmo sem pipeline de mídia (jsdom)', () => {
    render(<AudioBubble t={t} src="blob:audio" durationMs={12_000} />)
    const play = screen.getByRole('button', { name: t('voice.play') })
    fireEvent.click(play)
    expect(screen.getByRole('button', { name: t('voice.pause') })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: t('voice.pause') }))
    expect(screen.getByRole('button', { name: t('voice.play') })).toBeTruthy()
  })

  it('mostra os estados da transcrição e o ver tudo', () => {
    const { rerender } = render(<AudioBubble t={t} src="blob:audio" durationMs={1_000} transcription={{ state: 'running' }} />)
    expect(screen.getByText(t('voice.transcribing'))).toBeTruthy()
    rerender(<AudioBubble t={t} src="blob:audio" durationMs={1_000} transcription={{ state: 'failed' }} />)
    expect(screen.getByText(t('voice.transcriptionFailed'))).toBeTruthy()
    rerender(<AudioBubble t={t} src="blob:audio" durationMs={1_000} transcription={{ state: 'done', text: 'bom dia' }} />)
    expect(screen.getByText('bom dia')).toBeTruthy()
    expect(screen.getByRole('button', { name: t('voice.showAll') })).toBeTruthy()
    rerender(<AudioBubble t={t} src="blob:audio" durationMs={1_000} transcription={{ state: 'none' }} onTranscribe={() => undefined} />)
    expect(screen.getByRole('button', { name: t('voice.transcribe') })).toBeTruthy()
  })

  it('pede consentimento com o tamanho e mostra o download', () => {
    const onTranscribe = vi.fn()
    const { rerender } = render(<AudioBubble t={t} src="blob:audio" durationMs={1_000} transcription={{ state: 'needs-model' }} onTranscribe={onTranscribe} />)
    expect(screen.getByText(new RegExp(t('voice.modelConsent').slice(0, 20), 'u'))).toBeTruthy()
    const consent = screen.getByRole('button', { name: t('voice.modelConsentAction') })
    fireEvent.click(consent)
    expect(onTranscribe).toHaveBeenCalledTimes(1)
    rerender(<AudioBubble t={t} src="blob:audio" durationMs={1_000} transcription={{ state: 'downloading' }} />)
    expect(screen.getByText(t('voice.downloading'))).toBeTruthy()
    rerender(<AudioBubble t={t} src="blob:audio" durationMs={1_000} transcription={{ state: 'download-failed' }} onTranscribe={onTranscribe} />)
    expect(screen.getByText(new RegExp(t('voice.downloadFailed').slice(0, 20), 'u'))).toBeTruthy()
    expect(screen.getByRole('button', { name: t('voice.modelConsentAction') })).toBeTruthy()
  })
})

describe('o envio da mensagem de voz', () => {
  function target() {
    const uploaded: File[] = []
    const channel: { body: string; ids: readonly string[] }[] = []
    const dm: { body: string; ids: readonly string[] }[] = []
    const store: VoiceSendTarget = {
      uploadChannelAttachment: async (file) => { uploaded.push(file); return { id: 'att-channel', name: file.name } },
      uploadDmAttachment: async (file) => { uploaded.push(file); return { id: 'att-dm', name: file.name } },
      postChannelMessage: async (body, ids = []) => { channel.push({ body, ids }) },
      postDmMessage: async (body, ids = []) => { dm.push({ body, ids }) },
    }
    return { store, uploaded, channel, dm }
  }

  it('sobe o áudio e posta a mensagem no canal', async () => {
    const { store, uploaded, channel, dm } = target()
    const sent = await sendVoiceMessage(store, { blob: new Blob(['abc'], { type: 'audio/webm' }), durationMs: 12_000, levels: [] }, 'channel')
    expect(sent.id).toBe('att-channel')
    expect(uploaded[0]?.name).toBe('voz-12s.webm')
    expect(uploaded[0]?.type).toBe('audio/webm')
    expect(channel).toEqual([{ body: '', ids: ['att-channel'] }])
    expect(dm).toEqual([])
  })

  it('na DM usa o caminho de DM', async () => {
    const { store, channel, dm } = target()
    const sent = await sendVoiceMessage(store, { blob: new Blob(['abc'], { type: 'audio/webm' }), durationMs: 3_000, levels: [] }, 'dm')
    expect(sent.id).toBe('att-dm')
    expect(dm).toEqual([{ body: '', ids: ['att-dm'] }])
    expect(channel).toEqual([])
  })
})

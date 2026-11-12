// @vitest-environment jsdom
/**
 * COLHEITA-S1 · P1-05 (Carbon): a bolha de áudio do fio. Vermelho primeiro. Keel 04:11: os bytes só ao tocar; a URL do objeto
 * é revogada ao desmontar.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LazyAudioBubble } from '../src/client/chat/voice-compose/LazyAudioBubble.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'

installPreviewTheme()
afterEach(() => { cleanup(); vi.restoreAllMocks() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

describe('P1-05 · bolha de áudio do fio', () => {
  it('não pede os bytes ao aparecer: só ao tocar', () => {
    const load = vi.fn(async () => 'blob:voz-1')
    render(<LazyAudioBubble t={t} load={load} />)
    expect(load).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: bindLocale(shellPt, 'voice.play') })).toBeTruthy()
  })

  it('ao tocar, pede uma vez e mostra o player com a URL do áudio', async () => {
    const load = vi.fn(async () => 'blob:voz-2')
    const { container } = render(<LazyAudioBubble t={t} load={load} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: bindLocale(shellPt, 'voice.play') }))
    })
    expect(load).toHaveBeenCalledTimes(1)
    expect(container.querySelector('audio')?.getAttribute('src')).toBe('blob:voz-2')
  })

  it('desmontar revoga a URL do objeto', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const load = vi.fn(async () => 'blob:voz-3')
    const { unmount } = render(<LazyAudioBubble t={t} load={load} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: bindLocale(shellPt, 'voice.play') }))
    })
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:voz-3')
  })
})

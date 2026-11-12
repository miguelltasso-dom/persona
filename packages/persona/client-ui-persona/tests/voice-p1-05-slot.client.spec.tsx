// @vitest-environment jsdom
/**
 * COLHEITA-S1 · P1-05 (Carbon): o anexo de áudio do fio. Vermelho primeiro: o tipo é pedido quando a mensagem aparece; só
 * anexo de áudio mostra a bolha; imagem não mostra nada; os bytes só com o toque.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AudioAttachmentContext, AudioAttachmentSlot } from '../src/client/chat/voice-compose/AudioAttachmentSlot.tsx'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as never

describe('P1-05 · anexo de áudio no fio', () => {
  it('um anexo de áudio mostra a bolha (botão de tocar); uma imagem não mostra nada', async () => {
    const check = vi.fn(async (id: string) => (id === 'voz-1' ? 4_000 : null))
    const load = vi.fn(async () => 'blob:voz')
    const access = { t, check, load }
    const { container } = render(
      <AudioAttachmentContext.Provider value={access}>
        <AudioAttachmentSlot attachmentId="voz-1" />
        <AudioAttachmentSlot attachmentId="foto-1" />
      </AudioAttachmentContext.Provider>,
    )
    await act(async () => { await Promise.resolve() })
    expect(check).toHaveBeenCalledWith('voz-1')
    expect(check).toHaveBeenCalledWith('foto-1')
    expect(screen.getAllByRole('button', { name: bindLocale(shellPt, 'voice.play') })).toHaveLength(1)
    expect(load).not.toHaveBeenCalled()
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })
})

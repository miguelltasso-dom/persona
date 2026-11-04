// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const shellT = ((key: string) => shellPt[key as keyof typeof shellPt] ?? key) as GeneralChannelViewProps['shellT']

function view(extra: Partial<GeneralChannelViewProps> = {}) {
  return render(<GeneralChannelView t={t} shellT={shellT} members={[]} messages={[]} {...extra} />)
}

describe('#geral: cabeçalho sem controle morto', () => {
  it('sem destino, o sino e o menu da conta nem viram botão (o avatar só mostra a presença)', () => {
    const { container } = view()
    expect(screen.queryByRole('button', { name: 'Notificações' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Sua conta' })).toBeNull()
    expect(container.querySelector('[data-static]')).not.toBeNull()
  })

  it('o sino abre as Aprovações e o ponto só existe quando há decisão esperando', () => {
    const onOpen = vi.fn()
    const { container, rerender } = view({ onOpenNotifications: onOpen, notificationsCount: 0 })
    const idle = screen.getByRole('button', { name: 'Notificações' })
    expect(idle.querySelector('[class*="badge"]')).toBeNull()
    fireEvent.click(idle)
    expect(onOpen).toHaveBeenCalledTimes(1)

    rerender(<GeneralChannelView t={t} shellT={shellT} members={[]} messages={[]} onOpenNotifications={onOpen} notificationsCount={3} />)
    const busy = screen.getByRole('button', { name: 'Notificações: 3 esperando você' })
    expect(busy.querySelector('[class*="badge"]')).not.toBeNull()
    expect(container.querySelectorAll('button[aria-label^="Notificações"]')).toHaveLength(1)
  })

  it('o menu da conta só é botão quando existe de verdade', () => {
    const onAccount = vi.fn()
    view({ onOpenAccount: onAccount })
    fireEvent.click(screen.getByRole('button', { name: 'Sua conta' }))
    expect(onAccount).toHaveBeenCalledTimes(1)
  })
})

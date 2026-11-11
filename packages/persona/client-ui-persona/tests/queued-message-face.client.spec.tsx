// @vitest-environment jsdom
// D-103c (RELEASE-NOTES v1.1, "Fila: o rosto na mensagem esperando"): o balão da fila desenhava a letra "E" (o nome de reserva era "Eu")
// no lugar do rosto de quem escreveu. Agora usa a MESMA identidade do avatar do topo da conversa ("Você" -> "V", ou o nome do usuário).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { QueuedMessageBubble } from '../src/client/chat/QueuedMessageBubble.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const shellT = ((key: string) => shellPt[key as keyof typeof shellPt] ?? key) as never
const atlas = { id: 'atlas' as const, name: 'Atlas', role: 'Coordenação', state: 'working' as const, systemRoles: ['coordination' as const] }

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})

const initialsIn = (root: ParentNode): string[] =>
  Array.from(root.querySelectorAll('[class*="initials"]')).map(node => node.textContent ?? '')

describe('o balão da fila não desenha a letra "E" (D-103c)', () => {
  it('sem autor conhecido o balão usa "Você" (V), nunca o reserva "Eu" (E)', () => {
    const { container } = render(
      <QueuedMessageBubble
        t={t}
        item={{ id: 'q1', text: 'Prioriza o contrato novo', targetPersonaName: 'Atlas' }}
        onSendNow={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    const letters = initialsIn(container)
    expect(letters).toEqual(['V'])
    expect(letters).not.toContain('E')
  })

  it('com o nome do autor dado, o balão usa esse nome', () => {
    const { container } = render(
      <QueuedMessageBubble
        t={t}
        item={{ id: 'q1', text: 'Oi', targetPersonaName: 'Atlas', authorName: 'Miguel Tasso' }}
        onSendNow={vi.fn()}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
      />,
    )
    expect(initialsIn(container)).toEqual(['MT'])
  })

  it('no #geral a fila mostra o MESMO rosto do avatar do topo da conversa (o nome do usuário nas mensagens)', () => {
    const { container } = render(
      <GeneralChannelView
        t={t}
        shellT={shellT}
        members={[atlas]}
        messages={[{ id: 'm1', authorId: 'user', authorName: 'Miguel Tasso', timeLabel: '14:02', body: 'Oi, equipe', reactions: [] }]}
        onSendMessage={vi.fn()}
      />,
    )
    const field = screen.getByRole('textbox')
    fireEvent.change(field, { target: { value: 'Prioriza o contrato novo' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    const bubble = screen.getByLabelText('Na fila: Prioriza o contrato novo')
    const top = container.querySelector('[class*="userButton"]')
    expect(top).not.toBeNull()
    expect(initialsIn(bubble)).toEqual(['MT'])
    expect(initialsIn(top as HTMLElement)).toEqual(['MT'])
  })

  it('no #geral sem mensagem do usuário ainda, o topo e a fila concordam em "V"', () => {
    const { container } = render(
      <GeneralChannelView t={t} shellT={shellT} members={[atlas]} messages={[]} onSendMessage={vi.fn()} />,
    )
    const field = screen.getByRole('textbox')
    fireEvent.change(field, { target: { value: 'Muda para o plano B' } })
    fireEvent.submit(field.closest('form') as HTMLFormElement)
    const bubble = screen.getByLabelText('Na fila: Muda para o plano B')
    expect(initialsIn(bubble)).toEqual(['V'])
    expect(initialsIn(container.querySelector('[class*="userButton"]') as HTMLElement)).toEqual(['V'])
  })
})

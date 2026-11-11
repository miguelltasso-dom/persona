// @vitest-environment jsdom
// D-103c (PLAN D103-2), três consertos do composer que o aceite reprovou:
//  (1) o chip "Decide o rotineiro" aparecia DUAS vezes (um ao lado de "Quem responde" e outro solto na barra de ações);
//  (2) o balão "A Coordenação distribui o pedido" não fechava ao enviar a 1ª mensagem (e ficava cobrindo o fio);
//  (3) Ctrl+V de uma imagem (print de tela, "copiar imagem") não fazia nada: a imagem tem de virar anexo.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer, WHO_RESPONDS_HINT_KEY } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const TEAM: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] },
  { id: 'nina', name: 'Nina', role: 'Pesquisa', state: 'resting' },
]
const SOLO: readonly ChannelPersonaMember[] = TEAM.slice(0, 1)
const HINT = 'A Coordenação distribui o pedido'

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

const field = (): HTMLTextAreaElement => screen.getByPlaceholderText(chatPt['composer.placeholderChannel']) as HTMLTextAreaElement

describe('chip de autonomia: um só por composer (D-103c)', () => {
  const LABEL = chatPt['composer.autonomy.act-within-limits']
  const count = (label: string): number => screen.queryAllByText(label).length

  beforeEach(() => { localStorage.setItem(WHO_RESPONDS_HINT_KEY, '1') })

  it('"Decide o rotineiro" aparece UMA vez com o seletor "Quem responde" visível', () => {
    render(<ChannelComposer t={t} members={TEAM} responderAutonomy="act-within-limits" />)
    expect(count(LABEL)).toBe(1)
    expect(document.querySelectorAll('[data-persona-composer-responder] button').length).toBeGreaterThan(0)
  })

  it('"Sempre pergunta" também aparece uma vez só', () => {
    render(<ChannelComposer t={t} members={TEAM} responderAutonomy="on-request" />)
    expect(count(chatPt['composer.autonomy.on-request'])).toBe(1)
  })

  it('sem o seletor (responderHidden, ex.: conversa direta) o chip continua existindo, uma vez só', () => {
    render(<ChannelComposer t={t} members={SOLO} responderHidden responderAutonomy="act-within-limits" />)
    expect(count(LABEL)).toBe(1)
  })

  it('o chip que sobra é o clicável: abre o cartão da persona', () => {
    const onOpenPersonaCard = vi.fn()
    render(<ChannelComposer t={t} members={TEAM} responderAutonomy="act-within-limits" onOpenPersonaCard={onOpenPersonaCard} />)
    fireEvent.click(screen.getByRole('button', { name: LABEL }))
    expect(onOpenPersonaCard).toHaveBeenCalledWith('atlas')
  })

  it('no padrão ("Sugere e espera") nenhum chip', () => {
    render(<ChannelComposer t={t} members={TEAM} responderAutonomy="propose" />)
    expect(count(LABEL)).toBe(0)
    expect(count(chatPt['composer.autonomy.on-request'])).toBe(0)
  })
})

describe('balão "A Coordenação distribui o pedido": fecha ao enviar a 1ª mensagem (D-103c)', () => {
  it('Enter no campo envia E fecha o balão (e ele não volta ao remontar)', () => {
    const onSend = vi.fn()
    const { unmount } = render(<ChannelComposer t={t} members={TEAM} onSend={onSend} />)
    expect(screen.getByRole('dialog', { name: HINT })).toBeTruthy()
    fireEvent.change(field(), { target: { value: 'oi, pessoal' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
    expect(localStorage.getItem(WHO_RESPONDS_HINT_KEY)).toBe('1')
    unmount()
    render(<ChannelComposer t={t} members={TEAM} onSend={onSend} />)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })

  it('o botão Enviar (sem pointerdown, como no teclado/leitor de tela) também fecha', () => {
    const onSend = vi.fn()
    render(<ChannelComposer t={t} members={TEAM} onSend={onSend} />)
    fireEvent.change(field(), { target: { value: 'um pedido' } })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.send'] }))
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })

  it('resposta a uma pergunta da persona (answerAttention) também conta como "enviou"', () => {
    const onSendReply = vi.fn(() => Promise.resolve())
    render(
      <ChannelComposer
        t={t}
        members={TEAM}
        onSend={vi.fn()}
        replyTarget={{ id: 'q1', personaName: 'Nina', question: 'Qual prazo?', onClear: vi.fn() } as never}
        onSendReply={onSendReply}
      />,
    )
    fireEvent.change(field(), { target: { value: 'sexta' } })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSendReply).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog', { name: HINT })).toBeNull()
  })

  it('Enter com o campo vazio não envia nada e NÃO fecha a dica', () => {
    const onSend = vi.fn()
    render(<ChannelComposer t={t} members={TEAM} onSend={onSend} />)
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: HINT })).toBeTruthy()
  })
})

describe('Ctrl+V de imagem vira anexo (D-103c)', () => {
  beforeEach(() => { localStorage.setItem(WHO_RESPONDS_HINT_KEY, '1') })

  const png = (name = 'image.png'): File => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })

  function pasteWith(data: { text?: string; files?: File[]; items?: Array<{ kind: string; type: string; getAsFile: () => File | null }> }): Event {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown }
    event.clipboardData = {
      getData: (type: string) => (type === 'text/plain' ? (data.text ?? '') : ''),
      files: data.files ?? [],
      items: data.items ?? (data.files ?? []).map(file => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    }
    act(() => { field().dispatchEvent(event) })
    return event
  }

  it('uma imagem no clipboard é enviada ao upload, vira anexo "pronto" e o paste padrão é cancelado', async () => {
    const uploadAttachment = vi.fn((file: File) => Promise.resolve({ id: 'att-img', name: file.name }))
    render(<ChannelComposer t={t} members={TEAM} onSend={vi.fn()} uploadAttachment={uploadAttachment} />)
    const shot = png('captura.png')
    const event = pasteWith({ files: [shot] })
    expect(event.defaultPrevented).toBe(true)
    expect(uploadAttachment).toHaveBeenCalledTimes(1)
    expect(uploadAttachment.mock.calls[0]?.[0]).toBe(shot)
    await waitFor(() => { expect(screen.getByText('captura.png')).toBeTruthy() })
    expect(field().value).toBe('')
  })

  it('só com `items` (sem `files`) também funciona — é assim que alguns clipboards entregam o print', async () => {
    const uploadAttachment = vi.fn((file: File) => Promise.resolve({ id: 'att-img', name: file.name }))
    render(<ChannelComposer t={t} members={TEAM} onSend={vi.fn()} uploadAttachment={uploadAttachment} />)
    const shot = png('print.png')
    pasteWith({ items: [{ kind: 'string', type: 'text/html', getAsFile: () => null }, { kind: 'file', type: 'image/png', getAsFile: () => shot }] })
    expect(uploadAttachment).toHaveBeenCalledTimes(1)
    await waitFor(() => { expect(screen.getByText('print.png')).toBeTruthy() })
  })

  it('imagem SEM nome (alguns clipboards) ganha um nome com a extensão certa', () => {
    const uploadAttachment = vi.fn((file: File) => Promise.resolve({ id: 'att-img', name: file.name }))
    render(<ChannelComposer t={t} members={TEAM} onSend={vi.fn()} uploadAttachment={uploadAttachment} />)
    pasteWith({ files: [new File([new Uint8Array([1])], '', { type: 'image/jpeg' })] })
    expect(uploadAttachment.mock.calls[0]?.[0]?.name).toBe('image.jpg')
  })

  it('várias imagens da mesma colagem viram vários anexos, mesmo com o mesmo nome (sem chave repetida)', async () => {
    const uploadAttachment = vi.fn((file: File) => Promise.resolve({ id: `att-${String(Math.random())}`, name: file.name }))
    render(<ChannelComposer t={t} members={TEAM} onSend={vi.fn()} uploadAttachment={uploadAttachment} />)
    pasteWith({ files: [png('image.png'), png('image.png')] })
    expect(uploadAttachment).toHaveBeenCalledTimes(2)
    await waitFor(() => { expect(screen.getAllByText('image.png')).toHaveLength(2) })
  })

  it('texto + imagem juntos (copiar células do Excel/Word) colam o TEXTO: nada é sequestrado', () => {
    const uploadAttachment = vi.fn()
    render(<ChannelComposer t={t} members={TEAM} onSend={vi.fn()} uploadAttachment={uploadAttachment} />)
    const event = pasteWith({ text: 'A1\tB1', files: [png()] })
    expect(event.defaultPrevented).toBe(false)
    expect(uploadAttachment).not.toHaveBeenCalled()
  })

  it('arquivo que não é imagem aceita pelo seletor (ex.: PDF) não é tratado como imagem', () => {
    const uploadAttachment = vi.fn()
    render(<ChannelComposer t={t} members={TEAM} onSend={vi.fn()} uploadAttachment={uploadAttachment} />)
    const event = pasteWith({ files: [new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })] })
    expect(event.defaultPrevented).toBe(false)
    expect(uploadAttachment).not.toHaveBeenCalled()
  })

  it('sem upload no host a colagem de imagem não faz nada de estranho (paste padrão segue)', () => {
    render(<ChannelComposer t={t} members={TEAM} onSend={vi.fn()} />)
    const event = pasteWith({ files: [png()] })
    expect(event.defaultPrevented).toBe(false)
  })

  it('upload que falha: o anexo continua na lista (com o ✕ para remover) e não envia nada em silêncio', async () => {
    const onSend = vi.fn()
    const uploadAttachment = vi.fn(() => Promise.reject(new Error('boom')))
    render(<ChannelComposer t={t} members={TEAM} onSend={onSend} uploadAttachment={uploadAttachment} />)
    pasteWith({ files: [png('falha.png')] })
    await waitFor(() => { expect(uploadAttachment).toHaveBeenCalledTimes(1) })
    expect(await screen.findByText('falha.png')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Remover/u })).toBeTruthy()
    expect(onSend).not.toHaveBeenCalled()
  })
})

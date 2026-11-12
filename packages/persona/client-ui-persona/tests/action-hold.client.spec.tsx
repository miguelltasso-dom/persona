// @vitest-environment jsdom
// COLHEITA 5 (Muse §5): "Segure para enviar" no cartão de ação externa: 1,2 s de pressão, clique curto só mostra a dica, teclado, uma vez só,
// o selo de prazo ("Vale até hoje, 18h" · "Vence em 40 min" · "Passou do prazo") e o cartão vencido com "Pedir de novo".
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ActionPreviewCard, type ActionDecision } from '../src/client/chat/ActionPreviewCard.tsx'
import { HOLD_APPROVE_MS, HOLD_HINT_MS } from '../src/client/chat/hold-approve.ts'
import { mapActionPreview, type ActionPreviewUi } from '../src/client/remote/map-host-ui.ts'
import type { ActionPreviewWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { holdToApprove } from './hold-approve-helper.client.ts'

installPreviewTheme()
afterEach(() => { cleanup(); vi.useRealTimers() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = { personas: [{ id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' }], members: [] } as unknown as TeamView

const wire = (extra: Partial<ActionPreviewWire> = {}): ActionPreviewWire => ({
  approvalId: 'approval-1', actionClass: 'send', verb: 'email', connectorName: 'Gmail', personaId: 'persona-nina',
  to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.',
  truncated: false, requestedByPerson: false, status: 'pending', ...extra,
})
const ui = (extra: Partial<ActionPreviewWire> = {}): ActionPreviewUi => mapActionPreview({ actionPreview: wire(extra) } as unknown as MessageView, TEAM)!
const pay = (): ActionPreviewUi => ui({ approvalId: 'approval-2', actionClass: 'pay', verb: 'pay', connectorName: 'Mercado Pago', amount: 'R$ 120,00', payee: 'Moinho Bom Grão' })
const del = (): ActionPreviewUi => ui({ approvalId: 'approval-3', actionClass: 'delete', verb: 'delete', connectorName: 'Drive', items: ['a.pdf', 'b.pdf'], count: 2 })

const card = (preview: ActionPreviewUi, onDecide?: (decision: ActionDecision) => void | Promise<void>, now?: () => number) =>
  render(<ActionPreviewCard t={t} preview={preview} rowTag="div" {...(onDecide === undefined ? {} : { onDecide })} {...(now === undefined ? {} : { now })} />)
const holdButton = (name = 'Segure para enviar'): HTMLButtonElement => screen.getByRole('button', { name }) as HTMLButtonElement

describe('o botão "Segure para enviar"', () => {
  it('o verbo muda (publicar · pagar · apagar), apagar usa a variante perigo e o rótulo diz o que acontece', () => {
    card(ui(), vi.fn())
    expect(holdButton().getAttribute('data-variant')).toBe('primary')
    cleanup()
    card(pay(), vi.fn())
    expect(holdButton('Segure para pagar').getAttribute('data-variant')).toBe('primary')
    cleanup()
    card(del(), vi.fn())
    expect(holdButton('Segure para apagar').getAttribute('data-variant')).toBe('danger')
    cleanup()
    card(ui({ actionClass: 'post', verb: 'post', connectorName: 'Instagram', body: 'Bolo de sexta!' }), vi.fn())
    expect(holdButton('Segure para publicar')).toBeTruthy()
  })

  it('segurar o tempo todo decide UMA vez; o rótulo vira "Enviando…" e o botão trava', async () => {
    const onDecide = vi.fn(() => new Promise<void>(() => undefined))
    card(ui(), onDecide)
    const button = holdButton()
    await holdToApprove(button)
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(1) })
    expect(onDecide).toHaveBeenCalledWith({ approvalId: 'approval-1', choice: 'send' })
    const busy = await screen.findByRole('button', { name: 'Enviando…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    await holdToApprove(busy)
    expect(onDecide).toHaveBeenCalledTimes(1)
  })

  it('soltar antes dos 1,2 s não decide nada e o enchimento volta; segurar de novo recomeça do zero', async () => {
    const onDecide = vi.fn()
    card(ui(), onDecide)
    const button = holdButton()
    await holdToApprove(button, HOLD_APPROVE_MS - 300)
    expect(button.getAttribute('data-phase')).toBe('idle')
    expect(onDecide).not.toHaveBeenCalled()
    await holdToApprove(button, HOLD_APPROVE_MS - 300) // 900 + 900 não soma
    expect(onDecide).not.toHaveBeenCalled()
  })

  it('o clique curto nunca envia: abre a dica "Segure o botão até encher." e ela some em 4 s', async () => {
    const onDecide = vi.fn()
    card(ui(), onDecide)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.pointerDown(holdButton(), { pointerType: 'mouse', button: 0 })
    fireEvent.pointerUp(holdButton(), { pointerType: 'mouse', button: 0 })
    expect(screen.getByText('Segure o botão até encher.')).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(HOLD_HINT_MS - 1) })
    expect(screen.queryByText('Segure o botão até encher.')).not.toBeNull()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.queryByText('Segure o botão até encher.')).toBeNull()
    expect(onDecide).not.toHaveBeenCalled()
  })

  it('a dica some no próximo gesto; um clique que nenhum "segurar" produziu (leitor de tela, script) só mostra como fazer', () => {
    const onDecide = vi.fn()
    card(ui(), onDecide)
    fireEvent.click(holdButton()) // detail 0: ativação sem pressão
    expect(screen.getByText('Segure o botão até encher.')).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByText('Segure o botão até encher.')).toBeNull()
    expect(onDecide).not.toHaveBeenCalled()
  })

  it('teclado: segurar Espaço (ou Enter) pelo tempo todo faz o mesmo; o repeat do teclado não reinicia; soltar antes cancela', async () => {
    const onDecide = vi.fn()
    card(ui(), onDecide)
    const button = holdButton()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.keyDown(button, { key: ' ' })
    await act(async () => { vi.advanceTimersByTime(600) })
    fireEvent.keyDown(button, { key: ' ', repeat: true })
    await act(async () => { vi.advanceTimersByTime(HOLD_APPROVE_MS - 600 - 1) })
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.keyUp(button, { key: ' ' }) // soltou 1 ms antes
    await act(async () => { vi.advanceTimersByTime(HOLD_APPROVE_MS) })
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.keyDown(button, { key: 'Enter' })
    await act(async () => { vi.advanceTimersByTime(HOLD_APPROVE_MS) })
    vi.useRealTimers()
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(1) })
  })

  it('perder o foco ou tirar o ponteiro de cima cancela', async () => {
    const onDecide = vi.fn()
    card(ui(), onDecide)
    const button = holdButton()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.pointerDown(button, { pointerType: 'mouse', button: 0 })
    await act(async () => { vi.advanceTimersByTime(800) })
    fireEvent.pointerLeave(button)
    await act(async () => { vi.advanceTimersByTime(HOLD_APPROVE_MS) })
    expect(onDecide).not.toHaveBeenCalled()
    fireEvent.pointerDown(button, { pointerType: 'mouse', button: 0 })
    await act(async () => { vi.advanceTimersByTime(800) })
    fireEvent.blur(button)
    await act(async () => { vi.advanceTimersByTime(HOLD_APPROVE_MS) })
    expect(onDecide).not.toHaveBeenCalled()
    expect(screen.queryByText('Segure o botão até encher.')).toBeNull() // cancelar não é "soltar cedo": sem dica
  })

  it('o botão direito do mouse não segura', async () => {
    const onDecide = vi.fn()
    card(ui(), onDecide)
    await holdToApprove(holdButton(), HOLD_APPROVE_MS) // sanity: o botão esquerdo funciona
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(1) })
    cleanup()
    const other = vi.fn()
    card(ui(), other)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.pointerDown(holdButton(), { pointerType: 'mouse', button: 2 })
    await act(async () => { vi.advanceTimersByTime(HOLD_APPROVE_MS * 2) })
    vi.useRealTimers()
    expect(other).not.toHaveBeenCalled()
  })

  it('acessível: a frase "Segure por 1 segundo para confirmar." fica sempre no DOM e descreve o botão; enquanto enche, o aviso diz "Confirmando…"', async () => {
    card(ui(), vi.fn())
    const button = holdButton()
    const described = document.getElementById(button.getAttribute('aria-describedby') ?? '')
    expect(described?.textContent).toBe('Segure por 1 segundo para confirmar.')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.pointerDown(button, { pointerType: 'mouse', button: 0 })
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Confirmando…')
    fireEvent.pointerUp(button)
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('')
  })

  it('se a decisão falhar, o botão volta e dá para segurar de novo', async () => {
    const onDecide = vi.fn().mockRejectedValueOnce(new Error('sem rede')).mockResolvedValue(undefined)
    card(ui(), onDecide)
    await holdToApprove(holdButton())
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Segure para enviar' })).toBeTruthy() })
    await holdToApprove(holdButton())
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(2) })
  })

  it('quem marcou "Não perguntar de novo" (enviar/publicar) aprova com um clique; pagar e apagar nunca dispensam o segurar', async () => {
    const onDecide = vi.fn()
    card(ui(), onDecide)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByRole('button', { name: 'Segure para enviar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith({ approvalId: 'approval-1', choice: 'send', remember: true }) })
    cleanup()
    card(pay(), vi.fn())
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pagar' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Segure para pagar' })).toBeTruthy()
  })

  it('a prévia cortada (sem ver tudo) deixa o botão desligado: nem segurando se envia às cegas', async () => {
    const onDecide = vi.fn()
    card(ui({ truncated: true }), onDecide)
    expect(holdButton().disabled).toBe(true)
    await holdToApprove(holdButton())
    expect(onDecide).not.toHaveBeenCalled()
  })
})

describe('o selo de prazo', () => {
  const at = (day: number, hour: number, minute = 0): Date => new Date(2026, 10, day, hour, minute, 0, 0)
  const clock = (date: Date) => () => date.getTime()
  const seal = (): HTMLElement | null => document.querySelector('[data-deadline]')

  it('"Vale até hoje, 18h" e "Vale até amanhã, 9h" em tinta suave', () => {
    card(ui({ expiresAt: at(11, 18).toISOString() }), vi.fn(), clock(at(11, 9)))
    expect(seal()?.textContent).toBe('Vale até hoje, 18h')
    expect(seal()?.getAttribute('data-deadline')).toBe('normal')
    cleanup()
    card(ui({ expiresAt: at(12, 9).toISOString() }), vi.fn(), clock(at(11, 10)))
    expect(seal()?.textContent).toBe('Vale até amanhã, 9h')
  })

  it('falta menos de 1 h: "Vence em 40 min", em âmbar (estado soon)', () => {
    card(ui({ expiresAt: at(11, 18).toISOString() }), vi.fn(), clock(at(11, 17, 20)))
    expect(seal()?.textContent).toBe('Vence em 40 min')
    expect(seal()?.getAttribute('data-deadline')).toBe('soon')
  })

  it('sem prazo do host não há selo (nada inventado)', () => {
    card(ui(), vi.fn())
    expect(seal()).toBeNull()
  })

  it('o relógio anda: o selo vira "Vence em …" e depois "Passou do prazo" sem recarregar', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    let now = at(11, 16, 55).getTime()
    card(ui({ expiresAt: at(11, 18).toISOString() }), vi.fn(), () => now)
    expect(seal()?.textContent).toBe('Vale até hoje, 18h')
    now = at(11, 17, 30).getTime()
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(seal()?.textContent).toBe('Vence em 30 min')
    now = at(11, 18, 1).getTime()
    await act(async () => { vi.advanceTimersByTime(30_000) })
    expect(document.querySelector('[data-action-preview="expired"]')).not.toBeNull()
  })
})

describe('o cartão que passou do prazo', () => {
  const expired = (extra: Partial<ActionPreviewWire> = {}): ActionPreviewUi =>
    ui({ status: 'cancelled', expired: true, expiresAt: '2026-11-11T12:00:00.000Z', failureReason: 'expirou', ...extra })

  it('só leitura: "Passou do prazo · Nina não enviou", o conteúdo continua à vista e NÃO há "Segure" nem Enviar/Editar/Cancelar', () => {
    card(expired(), vi.fn())
    const root = document.querySelector('[data-action-preview="expired"]') as HTMLElement
    expect(root).not.toBeNull()
    expect(screen.getByText('Passou do prazo · Nina não enviou')).toBeTruthy()
    expect(screen.getByText('Encomenda de sexta')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Segure|Enviar|Editar|Cancelar/u })).toBeNull()
    expect(screen.queryByText(/^Cancelado/u)).toBeNull()
  })

  it('"Pedir de novo" manda a escolha retry, uma vez; depois diz que a persona vai mandar outro cartão', async () => {
    const onDecide = vi.fn()
    const view = card(expired(), onDecide)
    fireEvent.click(screen.getByRole('button', { name: 'Pedir de novo' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith({ approvalId: 'approval-1', choice: 'retry' }) })
    view.unmount()
    card(expired({ retried: true }), onDecide)
    expect(screen.queryByRole('button', { name: 'Pedir de novo' })).toBeNull()
    expect(screen.getByText('Pedido de novo · Nina vai mandar outro cartão')).toBeTruthy()
  })

  it('sem onDecide o cartão vencido é só leitura (nenhum botão morto)', () => {
    card(expired())
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('um cartão cancelado de verdade continua sendo a linha "Cancelado" (não vira "vencido")', () => {
    card(ui({ status: 'cancelled' }), vi.fn())
    expect(screen.getByText('Cancelado · Nina não enviou')).toBeTruthy()
    expect(document.querySelector('[data-action-preview="expired"]')).toBeNull()
  })
})

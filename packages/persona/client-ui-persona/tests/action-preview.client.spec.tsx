// @vitest-environment jsdom
// D-084 / PERSONA-POWERS-SPEC §1 (HT-9 básico): o cartão de prévia de ação externa. Tudo o que sai da empresa é visto antes; a caixinha
// "Não perguntar de novo" nunca vem marcada e não existe em pagar/apagar; sem prévia completa não há Enviar; depois do clique, "Enviando…".
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionPreviewCard, ACTION_ITEMS_MAX, type ActionDecision } from '../src/client/chat/ActionPreviewCard.tsx'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { ACTION_PREVIEW_FLAG_KEY, isActionPreviewEnabled } from '../src/client/chat/action-preview-flag.ts'
import { mapActionPreview, mapMessage, type ActionPreviewUi, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { ActionPreviewWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { hostMessage } from './message-view-fixture.client.ts'
import { holdToApprove } from './hold-approve-helper.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
})

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']

const TEAM = {
  personas: [{ id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' }],
  members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
} as unknown as TeamView

/** Tira campos do fio (com `exactOptionalPropertyTypes` um campo ausente não é `undefined`). */
const without = (wire: ActionPreviewWire, omit: readonly (keyof ActionPreviewWire)[]): ActionPreviewWire => {
  const copy: Record<string, unknown> = { ...wire }
  for (const key of omit) delete copy[key]
  return copy as unknown as ActionPreviewWire
}
const email = (extra: Partial<ActionPreviewWire> = {}, omit: readonly (keyof ActionPreviewWire)[] = []): ActionPreviewWire => without({
  approvalId: 'approval-1', actionClass: 'send', verb: 'email', connectorName: 'Gmail', personaId: 'persona-nina',
  to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', body: 'Oi, Ana! Confirmo os 3 bolos de cenoura para sexta.',
  truncated: false, requestedByPerson: false, status: 'pending', ...extra,
}, omit)
const pay = (extra: Partial<ActionPreviewWire> = {}, omit: readonly (keyof ActionPreviewWire)[] = []): ActionPreviewWire => without({
  approvalId: 'approval-2', actionClass: 'pay', verb: 'pay', connectorName: 'Mercado Pago', personaId: 'persona-nina',
  amount: 'R$ 120,00', payee: 'Moinho Bom Grão', reference: 'Pedido 4471', truncated: false, requestedByPerson: false, status: 'pending', ...extra,
}, omit)
const del = (extra: Partial<ActionPreviewWire> = {}): ActionPreviewWire => ({
  approvalId: 'approval-3', actionClass: 'delete', verb: 'delete', connectorName: 'Drive', personaId: 'persona-nina',
  items: ['contrato-antigo.pdf', 'rascunho.docx', 'foto-1.png'], count: 3, truncated: false, requestedByPerson: false, status: 'pending', ...extra,
})

const ui = (wire: ActionPreviewWire): ActionPreviewUi => mapActionPreview({ actionPreview: wire } as unknown as MessageView, TEAM)!

describe('mapActionPreview', () => {
  it('mapeia o email com a persona do time (nome e rosto) e os campos limpos', () => {
    expect(ui(email({ to: '  ana@padarialua.com.br ' }))).toMatchObject({
      approvalId: 'approval-1', actionClass: 'send', verb: 'email', connectorName: 'Gmail', personaName: 'Nina', characterId: 'nina',
      to: 'ana@padarialua.com.br', subject: 'Encomenda de sexta', blind: false, status: 'pending',
    })
  })

  it('falha fechada: prévia cortada, sem o que conferir ou classe que não combina com o verbo = blind (sem Enviar)', () => {
    expect(ui(email({ truncated: true })).blind).toBe(true)
    expect(ui(email({ body: '  ' })).blind).toBe(true)
    expect(ui(email({}, ['to'])).blind).toBe(true)
    expect(ui(pay({}, ['payee'])).blind).toBe(true)
    expect(ui(pay({}, ['amount'])).blind).toBe(true)
    expect(ui(del({ items: [], count: 0 })).blind).toBe(true)
    expect(ui(email({ actionClass: 'pay' })).blind).toBe(true) // o host mandou email com classe de pagamento: não confia
    expect(ui(email()).blind).toBe(false)
    expect(ui(pay()).blind).toBe(false)
    expect(ui(del()).blind).toBe(false)
  })

  it('MUSE 04:37: missing só quando NÃO há nenhum campo para conferir (e não é a prévia cortada); os outros blind seguem sem ele', () => {
    expect(ui(email({}, ['to', 'subject', 'body'])).missing).toBe(true)
    expect(ui(pay({}, ['amount', 'payee', 'reference'])).missing).toBe(true)
    expect(ui(del({ items: [], count: 0 })).missing).toBe(true)
    expect(ui(email({ truncated: true }, ['to', 'subject', 'body'])).missing).toBeUndefined()
    expect(ui(email({}, ['to'])).missing).toBeUndefined()
    expect(ui(pay({}, ['payee'])).missing).toBeUndefined()
    expect(ui(email()).missing).toBeUndefined()
  })

  it('BUNDLE 5: o host REAL manda a palavra que decidiu a classe ("send" para email, "delete"…): vira o verbo da tela e a ação NÃO fica cega', () => {
    const host = ui(email({ verb: 'send' }))
    expect(host).toMatchObject({ verb: 'email', actionClass: 'send', blind: false })
    expect(ui(pay({ verb: 'payment' }))).toMatchObject({ verb: 'pay', blind: false })
    expect(ui(del({ verb: 'remove' }))).toMatchObject({ verb: 'delete', blind: false })
    expect(ui(email({ verb: 'post', actionClass: 'post' }))).toMatchObject({ verb: 'post' })
  })

  it('BUNDLE 5: palavra desconhecida cai para a CLASSE (tipada pelo host); palavra de OUTRA classe continua cega (falha fechada)', () => {
    expect(ui(email({ verb: 'enviar-por-gmail' }))).toMatchObject({ verb: 'email', blind: false })
    expect(ui(email({ verb: 'pay' })).blind).toBe(true) // classe send com a palavra "pay": não combina
  })

  it('BUNDLE 5: parte escondida (masked) é cega como a prévia cortada, mas NÃO é "a prévia não chegou"', () => {
    const masked = ui(email({ masked: true }))
    expect(masked.blind).toBe(true)
    expect(masked.missing).toBeUndefined()
    expect(ui(email()).blind).toBe(false)
  })

  it('sem id da aprovação ou sem conector não há cartão; mapMessage carrega a prévia', () => {
    expect(mapActionPreview({ actionPreview: email({ approvalId: ' ' }) } as unknown as MessageView, TEAM)).toBeUndefined()
    expect(mapActionPreview({ actionPreview: email({ connectorName: '' }) } as unknown as MessageView, TEAM)).toBeUndefined()
    expect(mapActionPreview({} as MessageView, TEAM)).toBeUndefined()
    const row = mapMessage(hostMessage({ id: 'm1', seq: 1, actorId: 'persona-nina', body: 'A Nina quer enviar um email.', subjectId: '', occurredAt: '2026-11-05T09:00:00.000Z', actionPreview: email() } as never), TEAM, 'ana')
    expect(row.actionPreview).toMatchObject({ approvalId: 'approval-1', verb: 'email' })
  })
})

describe('o cartão (flag persona.flag.actionPreview; cada botão só com destino)', () => {
  const card = (wire: ActionPreviewWire, onDecide?: (decision: ActionDecision) => void | Promise<void>) =>
    render(<ActionPreviewCard t={t} preview={ui(wire)} rowTag="div" {...(onDecide === undefined ? {} : { onDecide })} />)

  it('email: eyebrow com o verbo e o meio, a prévia real (para em negrito, assunto, corpo) e as 3 ações', () => {
    card(email(), vi.fn())
    expect(screen.getByRole('article', { name: 'Vai enviar um email · pelo Gmail' })).toBeTruthy()
    expect(screen.getByText('ana@padarialua.com.br').tagName).toBe('STRONG')
    expect(screen.getByText('Encomenda de sexta')).toBeTruthy()
    expect(screen.getByText('Oi, Ana! Confirmo os 3 bolos de cenoura para sexta.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Segure para enviar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy()
    // email não leva o aviso de irreversível (só pagar e apagar)
    expect(screen.queryByText('Isso não dá para desfazer depois.')).toBeNull()
  })

  it('sem onDecide o cartão é só leitura (nenhum botão morto, nem a caixinha)', () => {
    card(email())
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByText('ana@padarialua.com.br')).toBeTruthy()
  })

  it('"Você pediu · {persona} confirma antes de enviar" quando a pessoa pediu', () => {
    card(email({ requestedByPerson: true }), vi.fn())
    expect(screen.getByText('Você pediu · Nina confirma antes de enviar')).toBeTruthy()
  })

  it('a caixinha NUNCA vem marcada; marcada, o Enviar leva remember; sem marcar, não leva', async () => {
    const onDecide = vi.fn()
    const { unmount } = card(email(), onDecide)
    const box = screen.getByRole('checkbox', { name: 'Não perguntar de novo para Nina no Gmail' }) as HTMLInputElement
    expect(box.checked).toBe(false)
    await holdToApprove(screen.getByRole('button', { name: 'Segure para enviar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(1) })
    expect(onDecide.mock.calls[0]![0]).toEqual({ approvalId: 'approval-1', choice: 'send' })
    unmount()
    const second = vi.fn()
    card(email(), second)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))
    await waitFor(() => { expect(second).toHaveBeenCalledTimes(1) })
    expect(second.mock.calls[0]![0]).toEqual({ approvalId: 'approval-1', choice: 'send', remember: true })
  })

  it('pagar: verbo "Pagar", valor e quem recebe em negrito, aviso de irreversível e NENHUMA caixinha', () => {
    card(pay(), vi.fn())
    expect(screen.getByRole('article', { name: 'Vai pagar R$ 120,00 · pelo Mercado Pago' })).toBeTruthy()
    expect(screen.getByText('R$ 120,00').tagName).toBe('STRONG')
    expect(screen.getByText('Moinho Bom Grão').tagName).toBe('STRONG')
    expect(screen.getByText('Pedido 4471')).toBeTruthy()
    expect(screen.getByText('Isso não dá para desfazer depois.')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Segure para pagar' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
  })

  it('apagar: a lista (até 6 + "e mais n"), verbo "Apagar", aviso e nenhuma caixinha', () => {
    const many = Array.from({ length: 9 }, (_, index) => `arquivo-${index + 1}.pdf`)
    card(del({ items: many, count: 9 }), vi.fn())
    expect(screen.getByRole('article', { name: 'Vai apagar 9 itens · no Drive' })).toBeTruthy()
    expect(screen.getAllByText(/^arquivo-\d\.pdf$/u)).toHaveLength(ACTION_ITEMS_MAX)
    expect(screen.getByText('e mais 3')).toBeTruthy()
    expect(screen.getByText('Isso não dá para desfazer depois.')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Segure para apagar' })).toBeTruthy()
  })

  it('apagar 1 item: singular', () => {
    card(del({ items: ['so-um.pdf'], count: 1 }), vi.fn())
    expect(screen.getByRole('article', { name: 'Vai apagar 1 item · no Drive' })).toBeTruthy()
  })

  it('publicar: verbo "Publicar" e a caixinha existe (send/post); o texto do post vira a prévia', () => {
    card({ approvalId: 'approval-4', actionClass: 'post', verb: 'post', connectorName: 'Instagram', personaId: 'persona-nina', body: 'Bolo de cenoura de sexta!', truncated: false, requestedByPerson: false, status: 'pending' }, vi.fn())
    expect(screen.getByRole('article', { name: 'Vai publicar no Instagram' })).toBeTruthy()
    expect(screen.getByText('Bolo de cenoura de sexta!')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Segure para publicar' })).toBeTruthy()
    expect(screen.getByRole('checkbox')).toBeTruthy()
  })

  it('prévia parcial: sem Enviar habilitado, sem Editar, sem a caixinha, com a frase honesta', () => {
    card(email({ truncated: true }), vi.fn())
    expect(screen.getByText('A prévia está parcial: não dá para enviar às cegas.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Segure para enviar' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('MUSE 04:37: ação SEM nenhuma prévia: "A prévia não chegou, então não dá para conferir antes de enviar." e só Cancelar (sem Enviar, sem Editar, sem caixinha, sem conteúdo)', async () => {
    const onDecide = vi.fn()
    card(email({}, ['to', 'subject', 'body']), onDecide)
    expect(screen.getByText('A prévia não chegou, então não dá para conferir antes de enviar.')).toBeTruthy()
    expect(screen.queryByText('A prévia está parcial: não dá para enviar às cegas.')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Segure para enviar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('Para')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 'approval-1', choice: 'cancel' })) })
  })

  it('MUSE 04:37: "parcial" é SÓ da prévia cortada; faltando só um campo não é "não chegou"', () => {
    const { unmount } = card(email({ truncated: true }, ['to', 'subject', 'body']), vi.fn())
    expect(screen.getByText('A prévia está parcial: não dá para enviar às cegas.')).toBeTruthy()
    expect(screen.queryByText('A prévia não chegou, então não dá para conferir antes de enviar.')).toBeNull()
    unmount()
    card(email({}, ['to']), vi.fn())
    expect(screen.getByText('A prévia está parcial: não dá para enviar às cegas.')).toBeTruthy()
    expect(screen.queryByText('A prévia não chegou, então não dá para conferir antes de enviar.')).toBeNull()
  })

  it('BUNDLE 5: a linha "Enviado" usa sentTo (para quem de fato foi) e, sem ele, o to', () => {
    const { unmount } = card(email({ status: 'sent', sentAt: '2026-11-05T09:00:00.000Z', to: 'ana@padarialua.com.br', sentTo: 'ana.silva@padarialua.com.br' }))
    expect(document.body.textContent).toContain('ana.silva@padarialua.com.br')
    expect(document.body.textContent).not.toContain('ana@padarialua.com.br')
    unmount()
    card(email({ status: 'sent', sentAt: '2026-11-05T09:00:00.000Z' }))
    expect(document.body.textContent).toContain('ana@padarialua.com.br')
  })

  it('Cancelar manda "cancel" (e a caixinha marcada NÃO vira permissão)', async () => {
    const onDecide = vi.fn()
    card(email(), onDecide)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(1) })
    expect(onDecide.mock.calls[0]![0]).toEqual({ approvalId: 'approval-1', choice: 'cancel' })
  })

  it('Editar abre o assunto e a mensagem no cartão; "Salvar e enviar" manda o texto editado; "Voltar" desfaz', async () => {
    const onDecide = vi.fn()
    card(email(), onDecide)
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    const subject = screen.getByLabelText('Assunto') as HTMLInputElement
    const message = screen.getByLabelText('Mensagem') as HTMLTextAreaElement
    expect(subject.value).toBe('Encomenda de sexta')
    fireEvent.change(subject, { target: { value: 'Encomenda de sábado' } })
    fireEvent.change(message, { target: { value: 'Oi, Ana! Agora são 4 bolos.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(screen.getByText('Encomenda de sexta')).toBeTruthy() // a edição abandonada não vale
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    fireEvent.change(screen.getByLabelText('Assunto'), { target: { value: 'Encomenda de sábado' } })
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Oi, Ana! Agora são 4 bolos.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar e enviar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(1) })
    expect(onDecide.mock.calls[0]![0]).toEqual({ approvalId: 'approval-1', choice: 'edit', edited: { subject: 'Encomenda de sábado', body: 'Oi, Ana! Agora são 4 bolos.' } })
  })

  it('"Enviando…": o botão fica em loading e um 2º clique não decide de novo', async () => {
    let finish: () => void = () => undefined
    const onDecide = vi.fn(() => new Promise<void>((done) => { finish = done }))
    card(email(), onDecide)
    await holdToApprove(screen.getByRole('button', { name: 'Segure para enviar' }))
    const busy = await screen.findByRole('button', { name: 'Enviando…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    // um 2º segurar (ou clique) no botão travado não decide de novo
    await holdToApprove(busy)
    fireEvent.click(busy)
    expect(onDecide).toHaveBeenCalledTimes(1)
    finish()
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Segure para enviar' })).toBeTruthy() })
  })

  it('status "sending" do host: loading e nenhuma outra ação', () => {
    card(email({ status: 'sending' }), vi.fn())
    expect((screen.getByRole('button', { name: 'Enviando…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Editar' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('depois: enviado, cancelado, ajustado e falha viram linhas honestas (sem Desfazer em email/post/pagamento)', () => {
    const { unmount } = card(email({ status: 'sent', sentAt: '2026-11-05T12:30:00.000Z' }), vi.fn())
    expect(screen.getByText(/^Enviado para ana@padarialua\.com\.br · /u)).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    unmount()
    const second = card(email({ status: 'cancelled' }), vi.fn())
    expect(screen.getByText('Cancelado · Nina não enviou')).toBeTruthy()
    second.unmount()
    const third = card(email({ status: 'adjusted' }), vi.fn())
    expect(screen.getByText('Nina ajustou a mensagem. Confira de novo.')).toBeTruthy()
    third.unmount()
    const fourth = card(email({ status: 'failed', failureReason: 'O Gmail recusou o envio.' }), vi.fn())
    expect(screen.getByText('Não deu para concluir. O Gmail recusou o envio.')).toBeTruthy()
    fourth.unmount()
    card(email({ status: 'failed' }), vi.fn())
    expect(screen.getByText('Não deu para concluir. Tente de novo mais tarde.')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Desfazer/u)
  })

  it('nenhum id nem palavra técnica na tela', () => {
    card(email(), vi.fn())
    expect(document.body.textContent).not.toMatch(/approval-|persona-nina|argsHash|MCP|allowlist|undefined/u)
  })
})

describe('no MessageList e a flag persona.flag.actionPreview', () => {
  const row = (): ChannelMessageUi => ({ id: 'm2', authorId: 'nina', authorName: 'Nina', body: 'A Nina quer enviar um email para ana@padarialua.com.br.', timeLabel: '09:00', reactions: [], actionPreview: ui(email()) })

  it('flag desligada (padrão): a mensagem do host aparece como texto e nada executa', () => {
    expect(isActionPreviewEnabled()).toBe(false)
    render(<MessageList t={t} messages={[row()]} onDecideAction={vi.fn()} />)
    expect(screen.getByText(/A Nina quer enviar um email para ana@padarialua.com.br/u)).toBeTruthy()
    expect(document.querySelector('[data-action-preview]')).toBeNull()
  })

  it('flag ligada: vira o cartão (em <li>) e as decisões chegam ao handler', async () => {
    localStorage.setItem(ACTION_PREVIEW_FLAG_KEY, '1')
    const onDecide = vi.fn()
    render(<MessageList t={t} messages={[row()]} onDecideAction={onDecide} />)
    const card = document.querySelector('[data-action-preview="pending"]') as HTMLElement
    expect(card.tagName).toBe('LI')
    expect(within(card).getByRole('button', { name: 'Segure para enviar' })).toBeTruthy()
    expect(screen.queryByText(/A Nina quer enviar um email/u)).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith({ approvalId: 'approval-1', choice: 'cancel' }) })
  })

  it('a flag também liga por window.__PERSONA_FLAGS__.actionPreview', () => {
    ;(window as unknown as { __PERSONA_FLAGS__: { actionPreview: boolean } }).__PERSONA_FLAGS__ = { actionPreview: true }
    expect(isActionPreviewEnabled()).toBe(true)
  })
})

// @vitest-environment jsdom
// P0-10 (Carbon, colheita-s1), lado do cliente. Cada teste primeiro reproduziu o defeito (vermelho), depois a correção o deixou verde.
//  (c) A DM nunca passava onDecideAction / onUndoAction ao MessageList: o cartão de ação externa e a linha "· Desfazer" ficavam SEM botões.
//  (e) "Não perguntar de novo" marcada NO CARTÃO desligava o segure de 1,2 s já no 1º envio: o 1º envio nunca pode pular o segure.
//  (cc/bcc/anexos) o cartão mostra o que o host manda: destinatários e anexos escondidos não podem ser aprovados às cegas.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTION_PREVIEW_FLAG_KEY } from '../src/client/chat/action-preview-flag.ts'
import { ActionPreviewCard } from '../src/client/chat/ActionPreviewCard.tsx'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { mapActionPreview, type ActionPreviewUi, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { ActionPreviewWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { holdToApprove } from './hold-approve-helper.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
// O cartão e a linha da ação só viram controles com `persona.flag.actionPreview` ligada (o padrão do teste é desligada).
beforeEach(() => { localStorage.setItem(ACTION_PREVIEW_FLAG_KEY, '1') })
afterEach(() => { cleanup(); localStorage.removeItem(ACTION_PREVIEW_FLAG_KEY) })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as never
const TEAM = { personas: [{ id: 'nina', name: 'Nina', avatarRef: 'nina', title: 'Design' }], members: [] } as unknown as TeamView
const wire = (extra: Partial<ActionPreviewWire> = {}): ActionPreviewWire => ({
  approvalId: 'approval-1', actionClass: 'send', verb: 'email', connectorName: 'Gmail', personaId: 'nina', to: 'ana@padarialua.com.br',
  subject: 'Encomenda', body: 'Oi, Ana!', truncated: false, masked: false, requestedByPerson: false, status: 'pending', ...extra,
})
const ui = (extra: Partial<ActionPreviewWire> = {}): ActionPreviewUi => mapActionPreview({ actionPreview: wire(extra) } as unknown as MessageView, TEAM)!

const DM = { id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina' as const, role: 'Design', state: 'resting' as const }
const row = (extra: Partial<ChannelMessageUi>): ChannelMessageUi => ({ id: 'm1', authorId: 'nina', authorName: 'Nina', body: 'texto', timeLabel: '09:00', reactions: [], ...extra })

function dm(messages: readonly ChannelMessageUi[], handlers: { onDecideAction?: never; onUndoAction?: never } = {}) {
  return render(
    <DirectMessagesView t={t} shellT={shellTranslate} loading={false} dms={[DM]} selectedId="dm-nina" messages={messages} onSelect={() => undefined} onSend={() => undefined} {...handlers} />,
  )
}

describe('(c) a DM tem os mesmos controles do #geral', () => {
  it('o cartão de ação externa na DM tem "Segure para enviar" e manda a decisão ao handler', async () => {
    const onDecideAction = vi.fn()
    dm([row({ actionPreview: ui() })], { onDecideAction: onDecideAction as never })
    const hold = screen.getByRole('button', { name: 'Segure para enviar' })
    await holdToApprove(hold)
    await vi.waitFor(() => { expect(onDecideAction).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 'approval-1', choice: 'send' })) })
  })

  it('sem handler o cartão da DM é só leitura (nenhum botão morto), como no #geral', () => {
    dm([row({ actionPreview: ui() })])
    expect(screen.queryByRole('button', { name: 'Segure para enviar' })).toBeNull()
  })

  it('a linha da ação direta numa DM leva o "Desfazer · N" (a ação interna feita em DM tem onde desfazer)', () => {
    const onUndoAction = vi.fn()
    const until = new Date(Date.now() + 4 * 60_000).toISOString()
    dm([row({ actionEvent: { verb: 'board_card_create', connectorName: 'Persona', target: 'Post de sexta', activityId: 'act-1', undoable: true, undoUntilMs: Date.parse(until) } as never })], { onUndoAction: onUndoAction as never })
    const undo = screen.getByRole('button', { name: /^Desfazer · / })
    fireEvent.click(undo)
    expect(onUndoAction).toHaveBeenCalledWith('act-1')
  })
})

describe('(e) o 1º envio nunca pula o segure', () => {
  it('marcar "Não perguntar de novo" NÃO troca o "Segure" por um clique: o botão segue exigindo a pressão de 1,2 s', async () => {
    const onDecide = vi.fn()
    render(<ActionPreviewCard t={t} preview={ui()} rowTag="div" onDecide={onDecide} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByRole('button', { name: 'Enviar' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Segure para enviar' }))
    expect(onDecide).not.toHaveBeenCalled() // um clique não envia, mesmo com a caixinha marcada
    await holdToApprove(screen.getByRole('button', { name: 'Segure para enviar' }))
    await vi.waitFor(() => { expect(onDecide).toHaveBeenCalledWith({ approvalId: 'approval-1', choice: 'send', remember: true }) })
  })
})

describe('a falha do host aparece no cartão (nada de falha engolida)', () => {
  const refused = (): Error => Object.assign(new Error('O host da Persona não conseguiu concluir "decideApproval" (invalid-payload)'), { hostMessage: 'A prévia está cortada.' })

  it('"Cancelar" recusado pelo host mostra o motivo (o do host, não o código) e deixa tentar de novo', async () => {
    const onDecide = vi.fn().mockRejectedValueOnce(refused()).mockResolvedValue(undefined)
    render(<ActionPreviewCard t={t} preview={ui()} rowTag="div" onDecide={onDecide} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('Não deu para concluir. A prévia está cortada.')).toBeTruthy()
    expect(screen.queryByText(/decideApproval/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await vi.waitFor(() => { expect(onDecide).toHaveBeenCalledTimes(2) })
    await vi.waitFor(() => { expect(screen.queryByText('Não deu para concluir. A prévia está cortada.')).toBeNull() })
  })

  it('o segurar recusado pelo host sem motivo legível mostra o texto genérico e o botão volta a poder ser segurado', async () => {
    const onDecide = vi.fn().mockRejectedValueOnce(new Error('')).mockResolvedValue(undefined)
    render(<ActionPreviewCard t={t} preview={ui()} rowTag="div" onDecide={onDecide} />)
    await holdToApprove(screen.getByRole('button', { name: 'Segure para enviar' }))
    expect(await screen.findByText('Não deu para concluir. Tente de novo mais tarde.')).toBeTruthy()
    await vi.waitFor(() => { expect((screen.getByRole('button', { name: 'Segure para enviar' }) as HTMLButtonElement).disabled).toBe(false) })
  })
})

describe('cc, bcc e anexos aparecem na prévia', () => {
  it('o cartão mostra "Cc", "Cco" e "Anexos" (nada que o host manda fica escondido)', () => {
    render(<ActionPreviewCard t={t} preview={ui({ cc: 'chefe@padarialua.com.br', bcc: 'oculto@padarialua.com.br', attachments: ['orcamento.pdf', 'contrato.docx'] })} rowTag="div" onDecide={vi.fn()} />)
    expect(screen.getByText('chefe@padarialua.com.br')).toBeTruthy()
    expect(screen.getByText('oculto@padarialua.com.br')).toBeTruthy()
    expect(screen.getByText('orcamento.pdf')).toBeTruthy()
    expect(screen.getByText('contrato.docx')).toBeTruthy()
    expect(screen.getByText('Cc')).toBeTruthy()
    expect(screen.getByText('Cco')).toBeTruthy()
    expect(screen.getByText('Anexos')).toBeTruthy()
  })

  it('o que o host marca como escondido (masked) ou cortado (truncated) continua sem Enviar: não se aprova às cegas', () => {
    render(<ActionPreviewCard t={t} preview={ui({ masked: true })} rowTag="div" onDecide={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Segure para enviar' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

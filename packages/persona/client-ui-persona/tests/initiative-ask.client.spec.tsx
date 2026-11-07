// @vitest-environment jsdom
// D-084 / PERSONA-POWERS-SPEC §3: o pedido de iniciativa ("{persona} quer usar o {conector} para …") com Permitir desta vez · Sempre permitir
// para {persona} · Agora não, o Toast com Desfazer só quando há como desfazer, e nenhum botão sem destino.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InitiativeAskCard } from '../src/client/chat/InitiativeAskCard.tsx'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { ACTION_PREVIEW_FLAG_KEY } from '../src/client/chat/action-preview-flag.ts'
import { mapInitiativeAsk, mapMessage, type ChannelMessageUi, type InitiativeAskUi } from '../src/client/remote/map-host-ui.ts'
import type { InitiativeAskWire, MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers() })
afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = { personas: [{ id: 'persona-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' }], members: [] } as unknown as TeamView
const wire = (extra: Partial<InitiativeAskWire> = {}): InitiativeAskWire => ({ approvalId: 'approval-9', personaId: 'persona-nina', connectorName: 'Drive', purpose: 'buscar o contrato', status: 'pending', ...extra })
const ui = (extra: Partial<InitiativeAskWire> = {}): InitiativeAskUi => mapInitiativeAsk({ initiativeAsk: wire(extra) } as unknown as MessageView, TEAM)!
const flush = async (): Promise<void> => { await act(async () => { await vi.advanceTimersByTimeAsync(10) }) }

describe('mapInitiativeAsk', () => {
  it('mapeia o pedido com a persona do time', () => {
    expect(ui()).toMatchObject({ approvalId: 'approval-9', personaName: 'Nina', characterId: 'nina', connectorName: 'Drive', purpose: 'buscar o contrato', status: 'pending' })
  })

  it('sem id, conector ou motivo não há cartão (nada de "quer usar o  para .")', () => {
    for (const extra of [{ approvalId: ' ' }, { connectorName: '' }, { purpose: '  ' }]) {
      expect(mapInitiativeAsk({ initiativeAsk: wire(extra) } as unknown as MessageView, TEAM)).toBeUndefined()
    }
    expect(mapInitiativeAsk({} as MessageView, TEAM)).toBeUndefined()
  })

  it('mapMessage carrega o pedido', () => {
    const row = mapMessage(hostMessage({ id: 'm1', seq: 1, actorId: 'persona-nina', body: 'quer usar o Drive', subjectId: '', occurredAt: '2026-11-05T09:00:00.000Z', initiativeAsk: wire() } as never), TEAM, 'ana')
    expect(row.initiativeAsk).toMatchObject({ approvalId: 'approval-9', connectorName: 'Drive' })
  })
})

describe('o cartão', () => {
  const card = (ask: InitiativeAskUi, onDecide?: (id: string, choice: 'once' | 'always' | 'not-now') => void | Promise<void>, onUndoGrant?: (id: string) => void | Promise<void>) =>
    render(<InitiativeAskCard t={t} ask={ask} rowTag="div" {...(onDecide === undefined ? {} : { onDecide })} {...(onUndoGrant === undefined ? {} : { onUndoGrant })} />)

  it('a frase e as três saídas', () => {
    card(ui(), vi.fn())
    expect(screen.getByRole('article', { name: 'Nina quer usar o Drive para buscar o contrato.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Permitir desta vez' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sempre permitir para Nina' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeTruthy()
  })

  it('sem onDecide é só leitura (nenhum botão morto)', () => {
    card(ui())
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Nina quer usar o Drive para buscar o contrato.')).toBeTruthy()
  })

  it.each([
    ['Permitir desta vez', 'once'],
    ['Sempre permitir para Nina', 'always'],
    ['Agora não', 'not-now'],
  ] as const)('%s decide "%s" com o id da aprovação, uma vez só', async (label, choice) => {
    let finish: () => void = () => undefined
    const onDecide = vi.fn(() => new Promise<void>((done) => { finish = done }))
    card(ui(), onDecide)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(onDecide).toHaveBeenCalledWith('approval-9', choice)
    // enquanto decide, nenhum outro botão decide de novo
    for (const button of screen.getAllByRole('button')) fireEvent.click(button)
    expect(onDecide).toHaveBeenCalledTimes(1)
    finish()
    await flush()
  })

  it('o host recusa: a frase honesta e os botões voltam (a decisão não some)', async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error('boom'))
    card(ui(), onDecide)
    fireEvent.click(screen.getByRole('button', { name: 'Permitir desta vez' }))
    await flush()
    expect(screen.getByText('Não consegui registrar agora. Tente de novo.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Permitir desta vez' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('depois de decidido vira uma linha: "Permitido desta vez" · "Permitido sempre" · "Agora não"', () => {
    const once = card(ui({ status: 'decided', choice: 'once' }), vi.fn())
    expect(screen.getByText('Permitido desta vez · Nina usa o Drive')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    once.unmount()
    const always = card(ui({ status: 'decided', choice: 'always' }), vi.fn())
    expect(screen.getByText('Permitido sempre · Nina usa o Drive sem perguntar')).toBeTruthy()
    always.unmount()
    card(ui({ status: 'decided', choice: 'not-now' }), vi.fn())
    expect(screen.getByText('Agora não · Nina não usou o Drive')).toBeTruthy()
  })

  it('"Sempre permitir": o Toast "Agora Nina pode usar o Drive sem perguntar", SEM Desfazer quando o host não devolveu a concessão', async () => {
    // pendente -> o chamador decide (nenhuma concessão devolvida) -> o host marca decidido (a linha) e o Toast aparece
    const undo = vi.fn()
    const onDecide = vi.fn().mockResolvedValue(undefined)
    const { rerender } = card(ui(), onDecide, undo)
    fireEvent.click(screen.getByRole('button', { name: 'Sempre permitir para Nina' }))
    await flush()
    rerender(<InitiativeAskCard t={t} ask={ui({ status: 'decided', choice: 'always' })} rowTag="div" onDecide={onDecide} onUndoGrant={undo} />)
    expect(screen.getByText('Agora Nina pode usar o Drive sem perguntar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull() // sem a concessão do host não há o que desfazer
  })

  it('sem onUndoGrant também não há Desfazer, mesmo com a concessão devolvida', async () => {
    const onDecide = vi.fn().mockResolvedValue(true)
    const { rerender } = card(ui(), onDecide)
    fireEvent.click(screen.getByRole('button', { name: 'Sempre permitir para Nina' }))
    await flush()
    rerender(<InitiativeAskCard t={t} ask={ui({ status: 'decided', choice: 'always' })} rowTag="div" onDecide={onDecide} />)
    expect(screen.getByText('Agora Nina pode usar o Drive sem perguntar')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('com a concessão devolvida (connectorDecision.grant) o Toast leva o Desfazer, que chama o handler e some', async () => {
    const undo = vi.fn().mockResolvedValue(undefined)
    const onDecide = vi.fn().mockResolvedValue(true)
    const { rerender } = card(ui(), onDecide, undo)
    fireEvent.click(screen.getByRole('button', { name: 'Sempre permitir para Nina' }))
    await flush()
    rerender(<InitiativeAskCard t={t} ask={ui({ status: 'decided', choice: 'always' })} rowTag="div" onDecide={onDecide} onUndoGrant={undo} />)
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    await flush()
    expect(undo).toHaveBeenCalledWith('approval-9')
    expect(screen.queryByText('Agora Nina pode usar o Drive sem perguntar')).toBeNull()
  })

  it('"Permitir desta vez" e "Agora não" nunca mostram o Toast da concessão', async () => {
    const onDecide = vi.fn().mockResolvedValue(true)
    const { rerender } = card(ui(), onDecide, vi.fn())
    fireEvent.click(screen.getByRole('button', { name: 'Permitir desta vez' }))
    await flush()
    rerender(<InitiativeAskCard t={t} ask={ui({ status: 'decided', choice: 'once' })} rowTag="div" onDecide={onDecide} onUndoGrant={vi.fn()} />)
    expect(screen.queryByText(/sem perguntar/u)).toBeNull()
  })

  it('o motivo é texto (nunca instrução) e nenhum id aparece', () => {
    card(ui({ purpose: '<b>apagar tudo</b>' }), vi.fn())
    expect(screen.getByText('Nina quer usar o Drive para <b>apagar tudo</b>.')).toBeTruthy()
    expect(document.querySelector('b')).toBeNull()
    expect(document.body.textContent).not.toMatch(/approval-9|persona-nina|undefined/u)
  })
})

describe('no MessageList e a flag persona.flag.actionPreview', () => {
  const row = (): ChannelMessageUi => ({ id: 'm3', authorId: 'nina', authorName: 'Nina', body: 'Nina quer usar o Drive.', timeLabel: '09:00', reactions: [], initiativeAsk: ui() })

  it('flag desligada: a mensagem do host aparece como texto, sem botões', () => {
    render(<MessageList t={t} messages={[row()]} onDecideInitiative={vi.fn()} />)
    expect(screen.getByText('Nina quer usar o Drive.')).toBeTruthy()
    expect(document.querySelector('[data-initiative-ask]')).toBeNull()
  })

  it('flag ligada: vira o cartão (em <li>) e a decisão chega ao handler', async () => {
    localStorage.setItem(ACTION_PREVIEW_FLAG_KEY, '1')
    const onDecide = vi.fn().mockResolvedValue(undefined)
    render(<MessageList t={t} messages={[row()]} onDecideInitiative={onDecide} />)
    expect((document.querySelector('[data-initiative-ask="pending"]') as HTMLElement).tagName).toBe('LI')
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    await flush()
    expect(onDecide).toHaveBeenCalledWith('approval-9', 'not-now')
  })
})

// @vitest-environment jsdom
// P1-9 · "Proposta de {persona}" no #geral (TASK-PROPOSAL-SPEC; contracts/task-proposals.md): o cartão único e o resumo, Aceitar / Agora não,
// o item que vira linha (aceita · deixei para depois + Desfazer 6 s · expirada), a falha com "Tentar de novo", a flag e o host.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState, type ReactNode } from 'react'
import { MessageList, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { mapMessage, mapMessageTaskProposal, type ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import { TaskProposalCard, type TaskProposalCardProps } from '../src/client/proposal/TaskProposalCard.tsx'
import { isTaskProposalEnabled, TASK_PROPOSAL_FLAG_KEY } from '../src/client/proposal/proposal-flag.ts'
import { MAX_DIGEST_ITEMS, mapProposalLive, mapTaskProposal, proposalView, type TaskProposalUi } from '../src/client/proposal/task-proposal-model.ts'
import { useConnectedTaskProposals, type TaskProposalsBinding } from '../src/client/proposal/use-connected-task-proposals.ts'
import { decideProposal, listProposalStates, reopenProposal, taskProposalsRemoteFrom } from '../src/client/proposal/task-proposals-remote.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const TEAM = {
  personas: [
    { id: 'p-nina', name: 'Nina', avatarRef: 'nina', title: 'Pesquisa' },
    { id: 'p-bento', name: 'Bento', avatarRef: 'bento', title: 'Engenharia' },
    { id: 'p-atlas', name: 'Atlas', avatarRef: 'atlas', title: 'Coordenação' },
  ],
  members: [],
} as unknown as TeamView
const TENANT = { workspaceId: 'ws', projectId: 'proj' }

const ITEM = (id: string, name = 'Nina', personaId = 'p-nina', question = `Posso retomar “Relatório ${id}”?`, reason = 'Está parado há 3 dias.') => ({ id, personaId, personaName: name, question, reason })
const SINGLE: TaskProposalUi = { kind: 'single', items: [ITEM('prop-1')] }
const DIGEST: TaskProposalUi = { kind: 'digest', items: [ITEM('a'), ITEM('b', 'Bento', 'p-bento'), ITEM('c', 'Atlas', 'p-atlas')] }

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.useRealTimers() })

function card(extra: Partial<TaskProposalCardProps> = {}): ReactNode {
  return <TaskProposalCard t={t} proposal={SINGLE} authorName="Nina" timeLabel="09:10" onDecide={vi.fn().mockResolvedValue(undefined)} {...extra} />
}

describe('o mapa do host (modelo puro)', () => {
  it('um item é "Proposta de {persona}"; 2 ou 3 são o resumo; mais de 3 o contrato já corta, e a tela também', () => {
    expect(mapTaskProposal({ kind: 'single', items: [ITEM('x')] })?.kind).toBe('single')
    expect(mapTaskProposal({ kind: 'digest', items: [ITEM('x'), ITEM('y')] })?.kind).toBe('digest')
    expect(mapTaskProposal({ kind: 'digest', items: [ITEM('1'), ITEM('2'), ITEM('3'), ITEM('4')] })?.items).toHaveLength(MAX_DIGEST_ITEMS)
  })

  it('descarta item sem id, sem pergunta legível ou repetido; sem itens não há cartão', () => {
    expect(mapTaskProposal(undefined)).toBeUndefined()
    expect(mapTaskProposal({ kind: 'single', items: [] })).toBeUndefined()
    expect(mapTaskProposal({ kind: 'single', items: [ITEM('', 'Nina', 'p', 'Q?'), ITEM('x', 'Nina', 'p', '   ')] })).toBeUndefined()
    const mapped = mapTaskProposal({ kind: 'digest', items: [ITEM('x'), ITEM('x'), ITEM('y', 'Nina', 'p', ' Q? ', ' motivo ')] })
    expect(mapped?.items.map(item => item.id)).toEqual(['x', 'y'])
    expect(mapped?.items[1]).toMatchObject({ question: 'Q?', reason: 'motivo' })
  })

  it('o estado: o do host vale quando ele já decidiu; antes disso vale o que a pessoa acabou de fazer', () => {
    expect(proposalView(undefined, { phase: 'idle' })).toBe('open')
    expect(proposalView({ status: 'open' }, { phase: 'deciding', accept: true })).toBe('deciding')
    expect(proposalView({ status: 'open' }, { phase: 'failed', accept: true })).toBe('failed')
    expect(proposalView({ status: 'open' }, { phase: 'done', accept: false })).toBe('declined')
    expect(proposalView({ status: 'accepted' }, { phase: 'deciding', accept: false })).toBe('accepted')
    expect(proposalView({ status: 'expired' }, { phase: 'idle' })).toBe('expired')
    expect(mapProposalLive({ status: 'accepted', ticketId: 'tk-1', ticketTitle: ' Relatório ' })).toEqual({ status: 'accepted', ticketId: 'tk-1', ticketTitle: 'Relatório' })
    expect(mapProposalLive(undefined)).toBeUndefined()
  })
})

describe('o cartão único: "Proposta de {persona}"', () => {
  it('mostra o eyebrow, a pergunta, o motivo e os dois botões; Aceitar manda a decisão ao host', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined)
    render(card({ onDecide }))
    expect(screen.getByText('Proposta de Nina')).toBeTruthy()
    expect(screen.getByText('Posso retomar “Relatório prop-1”?')).toBeTruthy()
    expect(screen.getByText('Está parado há 3 dias.')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Proposta de Nina' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith('prop-1', true) })
    // o item vira UMA linha (sem o cartão) e o leitor de tela é avisado
    await waitFor(() => { expect(screen.getByText('Aceita: Posso retomar “Relatório prop-1”?', { selector: 'span:not(.persona-sr-only)' })).toBeTruthy() })
    expect(screen.queryByRole('button', { name: 'Aceitar' })).toBeNull()
    expect(screen.queryByRole('region')).toBeNull()
    expect(document.querySelector('[role="status"][aria-live="polite"]')?.textContent).toBe('Aceita: Posso retomar “Relatório prop-1”?')
  })

  it('sem motivo não há linha de motivo', () => {
    render(card({ proposal: { kind: 'single', items: [ITEM('p', 'Nina', 'p-nina', 'Posso retomar “X”?', '')] } }))
    expect(document.querySelector('p[class*="reason"]')).toBeNull()
  })

  it('aceita com a tarefa já nomeada: "Aceita · virou a tarefa {título}" e o título abre o cartão no quadro', () => {
    const onOpenTask = vi.fn()
    render(card({ liveById: { 'prop-1': { status: 'accepted', ticketId: 'tk-7', ticketTitle: 'Relatório de sexta' } }, onOpenTask }))
    expect(document.body.textContent).toContain('Aceita · virou a tarefa Relatório de sexta')
    fireEvent.click(screen.getByRole('button', { name: 'Relatório de sexta' }))
    expect(onOpenTask).toHaveBeenCalledWith('tk-7')
  })

  it('o título da tarefa só é link com destino (sem o handler, vira texto em negrito)', () => {
    render(card({ liveById: { 'prop-1': { status: 'accepted', ticketId: 'tk-7', ticketTitle: 'Relatório de sexta' } } }))
    expect(screen.queryByRole('button', { name: 'Relatório de sexta' })).toBeNull()
    expect(screen.getByText('Relatório de sexta').tagName).toBe('STRONG')
  })

  it('Agora não: "Deixei para depois" e o Desfazer por 6 s; depois dos 6 s o Desfazer some', async () => {
    vi.useFakeTimers()
    const onUndo = vi.fn().mockResolvedValue(undefined)
    render(card({ onUndo }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Agora não' })) })
    expect(screen.getByText('Deixei para depois')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy()
    await act(async () => { vi.advanceTimersByTime(5900) })
    expect(screen.queryByRole('button', { name: 'Desfazer' })).not.toBeNull()
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
    expect(screen.getByText('Deixei para depois')).toBeTruthy()
  })

  it('Desfazer reabre a proposta (volta o cartão com os botões)', async () => {
    const onUndo = vi.fn().mockResolvedValue(undefined)
    render(card({ onUndo }))
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => { expect(onUndo).toHaveBeenCalledWith('prop-1') })
    await waitFor(() => { expect(screen.getByRole('button', { name: 'Aceitar' })).toBeTruthy() })
    expect(screen.queryByText('Deixei para depois')).toBeNull()
  })

  it('sem onUndo não há Desfazer, e um "Agora não" que veio do host (não desta pessoa) também não tem', () => {
    const { unmount } = render(card({ liveById: { 'prop-1': { status: 'declined' } }, onUndo: vi.fn() }))
    expect(screen.getByText('Deixei para depois')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
    unmount()
    render(card())
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull()
  })

  it('expirada: a frase e nenhuma ação', () => {
    render(card({ liveById: { 'prop-1': { status: 'expired' } } }))
    expect(screen.getByText('Esta proposta expirou.')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a falha: "Não consegui registrar agora. Tentar de novo"; o item segue aberto e o link manda a MESMA decisão', async () => {
    const onDecide = vi.fn().mockRejectedValueOnce(new Error('conflict')).mockResolvedValueOnce(undefined)
    render(card({ onDecide }))
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    await waitFor(() => { expect(screen.getByText(/Não consegui registrar agora\./u)).toBeTruthy() })
    expect(screen.getByRole('button', { name: 'Aceitar' })).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' })) })
    expect(onDecide).toHaveBeenCalledTimes(2)
    expect(onDecide.mock.calls[1]).toEqual(['prop-1', true])
    await waitFor(() => { expect(screen.getByText(/Aceita:/u, { selector: 'span:not(.persona-sr-only)' })).toBeTruthy() })
  })

  it('durante o envio os dois botões ficam desligados (não há decisão dupla)', async () => {
    let resolve: () => void = () => {}
    const onDecide = vi.fn(() => new Promise<void>((done) => { resolve = done }))
    render(card({ onDecide }))
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true)
    await act(async () => { resolve() })
    await waitFor(() => { expect(screen.getByText(/Aceita:/u, { selector: 'span:not(.persona-sr-only)' })).toBeTruthy() })
  })

  it('só leitura (sem onDecide): nenhum botão, nenhum controle morto', () => {
    render(card({ onDecide: undefined }))
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('Posso retomar “Relatório prop-1”?')).toBeTruthy()
  })
})

describe('o resumo: "Propostas da equipe"', () => {
  it('é uma lista com uma linha por item, cada uma com os seus botões', () => {
    render(card({ proposal: DIGEST, authorName: 'Atlas' }))
    expect(screen.getByText('Propostas da equipe · 3')).toBeTruthy()
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Aceitar' })).toHaveLength(3)
    expect(screen.getAllByRole('button', { name: 'Agora não' })).toHaveLength(3)
  })

  it('cada item muda sozinho; quando todos foram decididos o cartão encolhe para as linhas de estado', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined)
    render(card({ proposal: DIGEST, authorName: 'Atlas', onDecide }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Aceitar' })[0]!)
    await waitFor(() => { expect(screen.getAllByRole('button', { name: 'Aceitar' })).toHaveLength(2) })
    expect(screen.getByRole('region')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Agora não' })[0]!)
    await waitFor(() => { expect(screen.getAllByRole('button', { name: 'Aceitar' })).toHaveLength(1) })
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    await waitFor(() => { expect(screen.queryByRole('region')).toBeNull() })
    expect(onDecide.mock.calls.map(call => call[0])).toEqual(['a', 'b', 'c'])
    expect(document.querySelectorAll('[data-proposal-state]')).toHaveLength(3)
  })
})

describe('no fio, com e sem a flag', () => {
  const proposalEvent = (extra: Record<string, unknown> = {}): MessageView => ({
    id: 'm1', streamId: 'channel:geral', seq: 1, body: 'Nina sugeriu: Posso retomar “Relatório de sexta”? (Está parado há 3 dias.)',
    actorId: 'p-nina', subjectId: '', occurredAt: '2026-11-04T20:00:00.000Z', type: 'message', source: 'host', attachmentIds: [], replyToId: '', editedAt: '',
    pinned: false, reactions: [], topicId: '',
    taskProposal: { kind: 'single', items: [{ id: 'prop-1', personaId: 'p-nina', personaName: 'Nina', question: 'Posso retomar “Relatório de sexta”?', reason: 'Está parado há 3 dias.' }] },
    ...extra,
  } as unknown as MessageView)
  const message = (): ChannelMessageUi => mapMessage(proposalEvent(), TEAM, 'owner')
  const binding = (extra: Partial<TaskProposalsBinding> = {}): TaskProposalsBinding => ({ liveById: {}, onDecide: vi.fn().mockResolvedValue(undefined), onUndo: vi.fn().mockResolvedValue(undefined), ...extra })

  it('o mapa leva o cartão com o nome e o retrato do elenco', () => {
    const ui = mapMessageTaskProposal(proposalEvent(), TEAM)
    expect(ui?.items[0]?.personaName).toBe('Nina')
    expect(ui?.items[0]?.characterId).toBeTruthy()
    expect(mapMessageTaskProposal(proposalEvent({ taskProposal: undefined }), TEAM)).toBeUndefined()
  })

  it('sem o binding (flag desligada) a frase simples do host aparece e nenhum botão', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[message()]} /></ol>)
    expect(screen.getByText(/Nina sugeriu: Posso retomar/u)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aceitar' })).toBeNull()
    expect(document.querySelector('[data-task-proposal]')).toBeNull()
  })

  it('com o binding a proposta vira o cartão e a frase simples some; Aceitar chega ao host', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined)
    render(<ol><MessageList t={t} team={TEAM} messages={[message()]} taskProposals={binding({ onDecide })} /></ol>)
    expect(document.querySelector('[data-task-proposal="single"]')).not.toBeNull()
    expect(screen.queryByText(/Nina sugeriu:/u)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar' }))
    await waitFor(() => { expect(onDecide).toHaveBeenCalledWith('prop-1', true) })
  })

  it('o estado vivo do host (aceita, com a tarefa) chega ao cartão', () => {
    render(<ol><MessageList t={t} team={TEAM} messages={[message()]} taskProposals={binding({ liveById: { 'prop-1': { status: 'accepted', ticketId: 'tk-7', ticketTitle: 'Relatório de sexta' } } })} onOpenTaskOnBoard={vi.fn()} /></ol>)
    expect(document.body.textContent).toContain('Aceita · virou a tarefa Relatório de sexta')
  })
})

describe('o Remote do host (task-proposals-remote)', () => {
  it('só enxerga o host que tem as três chamadas', () => {
    expect(taskProposalsRemoteFrom(undefined)).toBeUndefined()
    expect(taskProposalsRemoteFrom({ listTaskProposals: () => [], decideTaskProposal: () => ({}) })).toBeUndefined()
    expect(taskProposalsRemoteFrom({ listTaskProposals: () => [], decideTaskProposal: () => ({}), reopenTaskProposal: () => ({}) })).toBeDefined()
  })

  it('lista por id, decide com {id, accept} e reabre; a falha sobe com a frase do host', async () => {
    const decide = vi.fn().mockResolvedValue({ ok: true, value: { id: 'a', status: 'accepted', ticketId: 'tk-1', ticketTitle: 'Relatório' } })
    const reopen = vi.fn().mockResolvedValue({ id: 'a', status: 'open' })
    const remote = taskProposalsRemoteFrom({
      listTaskProposals: vi.fn().mockResolvedValue({ ok: true, value: [{ id: 'a', status: 'declined' }, { id: 'b', status: 'open' }] }),
      decideTaskProposal: decide,
      reopenTaskProposal: reopen,
    })!
    expect(await listProposalStates(remote, TENANT)).toEqual({ a: { status: 'declined' }, b: { status: 'open' } })
    expect(await decideProposal(remote, TENANT, 'a', true)).toEqual({ status: 'accepted', ticketId: 'tk-1', ticketTitle: 'Relatório' })
    expect(decide).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', id: 'a', accept: true })
    expect(await reopenProposal(remote, TENANT, 'a')).toEqual({ status: 'open' })
    expect(reopen).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', id: 'a' })
    const failing = taskProposalsRemoteFrom({
      listTaskProposals: () => [],
      decideTaskProposal: () => ({ ok: false, error: { code: 'conflict', message: 'Não consegui criar a tarefa agora. Tente de novo.' } }),
      reopenTaskProposal: () => [],
    })!
    await expect(decideProposal(failing, TENANT, 'a', true)).rejects.toThrow('Não consegui criar a tarefa agora. Tente de novo.')
  })
})

describe('a flag persona.flag.taskProposal e o hook', () => {
  it('desligada por padrão; liga por localStorage ou pela janela', () => {
    expect(isTaskProposalEnabled()).toBe(false)
    localStorage.setItem(TASK_PROPOSAL_FLAG_KEY, '0')
    expect(isTaskProposalEnabled()).toBe(false)
    localStorage.setItem(TASK_PROPOSAL_FLAG_KEY, '1')
    expect(isTaskProposalEnabled()).toBe(true)
    localStorage.clear()
    ;(window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__ = { taskProposal: true }
    expect(isTaskProposalEnabled()).toBe(true)
    delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
  })

  function Probe({ remote, messages }: { readonly remote: object | undefined; readonly messages: readonly ChannelMessageUi[] }): ReactNode {
    const [tick] = useState(0)
    const binding = useConnectedTaskProposals({ remote, tenant: TENANT, messages, refreshKey: `${String(messages.length)}:${String(tick)}` })
    return (
      <div>
        <span data-testid="state">{binding === undefined ? 'off' : 'on'}</span>
        <span data-testid="live">{binding === undefined ? '' : JSON.stringify(binding.liveById)}</span>
        <button type="button" onClick={() => { void binding?.onDecide('prop-1', false).catch(() => undefined) }}>recusar</button>
        <button type="button" onClick={() => { void binding?.onUndo('prop-1').catch(() => undefined) }}>desfazer</button>
      </div>
    )
  }
  const withProposal = (): ChannelMessageUi => mapMessage({
    id: 'm1', streamId: 'channel:geral', seq: 1, body: 'x', actorId: 'p-nina', subjectId: '', occurredAt: '2026-11-04T20:00:00.000Z', type: 'message', source: 'host',
    attachmentIds: [], replyToId: '', editedAt: '', pinned: false, reactions: [], topicId: '',
    taskProposal: { kind: 'single', items: [{ id: 'prop-1', personaId: 'p-nina', personaName: 'Nina', question: 'Posso retomar “X”?', reason: '' }] },
  } as unknown as MessageView, TEAM, 'owner')
  const fakeRemote = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    listTaskProposals: vi.fn().mockResolvedValue([{ id: 'prop-1', status: 'open' }]),
    decideTaskProposal: vi.fn().mockResolvedValue({ id: 'prop-1', status: 'declined' }),
    reopenTaskProposal: vi.fn().mockResolvedValue({ id: 'prop-1', status: 'open' }),
    ...extra,
  })

  it('desligado por padrão: sem a flag o host nem é chamado; com a flag mas sem as chamadas, ou sem proposta no fio, fica desligado', async () => {
    const remote = fakeRemote()
    render(<Probe remote={remote} messages={[withProposal()]} />)
    expect(screen.getByTestId('state').textContent).toBe('off')
    await act(async () => { await Promise.resolve() })
    expect(remote.listTaskProposals).not.toHaveBeenCalled()
    cleanup()
    localStorage.setItem(TASK_PROPOSAL_FLAG_KEY, '1')
    const { rerender } = render(<Probe remote={{ listTaskProposals: () => [] }} messages={[withProposal()]} />)
    expect(screen.getByTestId('state').textContent).toBe('off')
    rerender(<Probe remote={fakeRemote()} messages={[]} />)
    expect(screen.getByTestId('state').textContent).toBe('off')
  })

  it('ligado: lê o estado vivo, decide e desfaz pelo Remote; a resposta do host vale até a próxima leitura', async () => {
    localStorage.setItem(TASK_PROPOSAL_FLAG_KEY, '1')
    const remote = fakeRemote()
    render(<Probe remote={remote} messages={[withProposal()]} />)
    expect(screen.getByTestId('state').textContent).toBe('on')
    await waitFor(() => { expect(screen.getByTestId('live').textContent).toContain('"prop-1"') })
    fireEvent.click(screen.getByRole('button', { name: 'recusar' }))
    await waitFor(() => { expect(remote.decideTaskProposal).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', id: 'prop-1', accept: false }) })
    fireEvent.click(screen.getByRole('button', { name: 'desfazer' }))
    await waitFor(() => { expect(remote.reopenTaskProposal).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj', id: 'prop-1' }) })
    await waitFor(() => { expect((remote.listTaskProposals as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3) })
  })
})

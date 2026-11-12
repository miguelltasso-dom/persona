// @vitest-environment jsdom
// COLHEITA 18 (Muse §18): the task conversation panel connected to the host: opens the thread, shows the empty state or the messages (the same
// list as the DM), writes into the thread of the task, says when it could not open or send, and only exists when the host has the calls.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectedTaskConversation, taskConversationBridgeOf, type TaskConversationBridge } from '../src/client/remote/ConnectedTaskConversation.tsx'
import type { TaskConversationRemote } from '../src/client/remote/use-task-conversation.ts'
import type { MessageStreamFrame } from '../src/client/remote/apply-message-stream.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { hostMessage } from './message-view-fixture.client.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); localStorage.clear() })

const TEAM = { personas: [{ id: 'bia', name: 'Bia', avatarRef: 'bia', title: 'Atendimento' }], members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }] } as unknown as TeamView
const CARD: KanbanCardModel = {
  id: 't-1', title: 'Post de sexta', projectId: 'pp', projectName: 'Padaria', teamId: 't', teamName: 'Equipe', column: 'in_progress',
  waitingEvent: false, blocked: false, reviewApproved: false, assignee: { id: 'bia', name: 'Bia', initials: 'B' }, dueLabel: 'sexta',
}
const OPEN = { streamKind: 'channel', ownerId: 'geral', topicId: 'task:t-1', title: 'Post de sexta', caring: [{ personaId: 'bia', name: 'Bia' }] }
const message = (id: string, seq: number, body: string, actorId = 'ana'): MessageView => hostMessage({ id, seq, actorId, body, subjectId: '', occurredAt: '2026-11-12T09:00:00.000Z' } as never)

function bridge(over: Partial<TaskConversationRemote> = {}, frames: MessageStreamFrame[] = [{ kind: 'baseline', events: [], order: [] }]): { bridge: TaskConversationBridge; remote: TaskConversationRemote } {
  const remote: TaskConversationRemote = {
    openTaskConversation: vi.fn(async () => OPEN),
    markTaskThreadRead: vi.fn(async () => true),
    followMessages: (_request, signal) => (async function* () {
      for (const frame of frames) yield frame
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    })(),
    postMessage: vi.fn(() => undefined),
    ...over,
  }
  return { bridge: { remote, scope: { workspaceId: 'ws', projectId: 'pp', memberId: 'ana' }, team: TEAM }, remote }
}

const mount = (b: TaskConversationBridge, onClose = vi.fn()) => render(<ConnectedTaskConversation bridge={b} kanbanDict={kanbanPt} card={CARD} columnLabel="Fazendo" onClose={onClose} />)

describe('a conversa da tarefa conectada', () => {
  it('abre: "Abrindo a conversa…", depois o vazio ("Ninguém falou desta tarefa ainda.") e o campo para quem cuida dela', async () => {
    const { bridge: b } = bridge()
    mount(b)
    expect(screen.getByText('Abrindo a conversa…')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('Ninguém falou desta tarefa ainda.')).toBeTruthy() })
    expect(screen.getByText('Peça algo a quem cuida dela.')).toBeTruthy()
    expect(screen.getByPlaceholderText('Escreva para Bia sobre esta tarefa')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'Post de sexta' })).toBeTruthy()
    expect(screen.getByText('Quem cuida: Bia')).toBeTruthy()
  })

  it('com mensagens mostra o fio (o mesmo da DM) e some o vazio', async () => {
    const { bridge: b } = bridge({}, [{ kind: 'baseline', events: [message('m1', 1, 'Pode ajustar a legenda?'), message('m2', 2, 'Já ajusto!', 'bia')], order: ['m1', 'm2'] }])
    mount(b)
    await waitFor(() => { expect(screen.getByText('Pode ajustar a legenda?')).toBeTruthy() })
    expect(screen.getByText('Já ajusto!')).toBeTruthy()
    expect(screen.queryByText('Ninguém falou desta tarefa ainda.')).toBeNull()
  })

  it('escrever manda para o tópico da tarefa, no stream dela, como a pessoa', async () => {
    const { bridge: b, remote } = bridge()
    mount(b)
    const field = await screen.findByPlaceholderText('Escreva para Bia sobre esta tarefa')
    fireEvent.change(field, { target: { value: 'Troque a foto' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => { expect(remote.postMessage).toHaveBeenCalledTimes(1) })
    expect(remote.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      streamKind: 'channel', ownerId: 'geral', actorId: 'ana', body: 'Troque a foto', topicId: 'task:t-1',
    }))
  })

  it('o host não recebeu: "Não deu para enviar. Tente de novo." (nunca finge que foi)', async () => {
    const { bridge: b } = bridge({ postMessage: vi.fn(() => { throw new Error('sem rede') }) })
    mount(b)
    const field = await screen.findByPlaceholderText('Escreva para Bia sobre esta tarefa')
    fireEvent.change(field, { target: { value: 'oi' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => { expect(screen.getByText('Não deu para enviar. Tente de novo.')).toBeTruthy() })
  })

  it('não abriu: "Não deu para abrir a conversa agora." e "Tentar de novo" abre de novo', async () => {
    const open = vi.fn().mockRejectedValueOnce(new Error('Tarefa não encontrada.')).mockResolvedValue(OPEN)
    const { bridge: b } = bridge({ openTaskConversation: open })
    mount(b)
    await waitFor(() => { expect(screen.getByText('Não deu para abrir a conversa agora. Tente de novo.')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => { expect(screen.getByText('Ninguém falou desta tarefa ainda.')).toBeTruthy() })
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('a aba "Detalhes" mostra o projeto, a etapa, quem cuida e o prazo', async () => {
    const { bridge: b } = bridge()
    mount(b)
    fireEvent.click(screen.getByRole('tab', { name: 'Detalhes' }))
    const panel = screen.getByRole('tabpanel', { name: 'Detalhes' })
    expect(panel.textContent).toContain('Padaria')
    expect(panel.textContent).toContain('Fazendo')
    expect(panel.textContent).toContain('Bia')
    expect(panel.textContent).toContain('sexta')
  })

  it('Esc fecha o painel', () => {
    vi.useFakeTimers()
    const onClose = vi.fn()
    mount(bridge().bridge, onClose)
    fireEvent.keyDown(screen.getByRole('complementary'), { key: 'Escape' })
    vi.advanceTimersByTime(600)
    expect(onClose).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('taskConversationBridgeOf', () => {
  const scope = { workspaceId: 'ws', projectId: 'pp', memberId: 'ana' }

  it('só existe quando o host tem as chamadas da conversa da tarefa e há quem olha', () => {
    const full = bridge().remote
    expect(taskConversationBridgeOf(full as never, scope, TEAM)?.scope).toEqual(scope)
    expect(taskConversationBridgeOf(full as never, null, TEAM)).toBeUndefined()
    expect(taskConversationBridgeOf({ ...full, openTaskConversation: undefined } as never, scope, TEAM)).toBeUndefined()
    expect(taskConversationBridgeOf({ ...full, followMessages: undefined } as never, scope, TEAM)).toBeUndefined()
    expect(taskConversationBridgeOf({} as never, scope, TEAM)).toBeUndefined() // host antigo: o cartão não abre nada
  })
})

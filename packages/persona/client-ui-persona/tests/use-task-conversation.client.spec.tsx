// @vitest-environment jsdom
// COLHEITA 18: the hook of the task conversation against a fake host — open, follow ONLY the thread (topicId 'task:<id>'), stream into messages,
// mark the thread read (never going back), write into it, and the honest states (closed, unavailable, bad answer, retry).
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useTaskConversation, type TaskConversationRemote } from '../src/client/remote/use-task-conversation.ts'
import type { MessageStreamFrame } from '../src/client/remote/apply-message-stream.ts'
import type { MessageView, TeamView } from '../src/client/remote/persona-remote-types.ts'
import { hostMessage } from './message-view-fixture.client.ts'

const SCOPE = { workspaceId: 'ws', projectId: 'pp', memberId: 'ana' }
const TEAM = { personas: [{ id: 'bia', name: 'Bia', avatarRef: 'bia', title: 'Atendimento' }], members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }] } as unknown as TeamView
const OPEN = { streamKind: 'channel', ownerId: 'geral', topicId: 'task:t-1', title: 'Post de sexta', caring: [{ personaId: 'bia', name: 'Bia' }] }

const message = (id: string, seq: number, body: string, actorId = 'ana'): MessageView =>
  hostMessage({ id, seq, actorId, body, subjectId: '', occurredAt: '2026-11-12T09:00:00.000Z' } as never)

/** A fake follow: yields the frames the test pushes, until aborted. */
function fakeHost(over: Partial<TaskConversationRemote> = {}) {
  const frames: MessageStreamFrame[] = []
  let wake: (() => void) | undefined
  const requests: unknown[] = []
  const push = (frame: MessageStreamFrame): void => { frames.push(frame); wake?.() }
  const remote: TaskConversationRemote = {
    openTaskConversation: vi.fn(async () => OPEN),
    markTaskThreadRead: vi.fn(async () => true),
    followMessages: (request, signal) => {
      requests.push(request)
      return (async function* () {
        let index = 0
        while (!signal.aborted) {
          if (index < frames.length) { yield frames[index]!; index += 1; continue }
          await new Promise<void>((resolve) => { wake = resolve; signal.addEventListener('abort', () => { resolve() }, { once: true }) })
        }
      })()
    },
    postMessage: vi.fn(() => undefined),
    ...over,
  }
  return { remote, push, requests }
}

const baseline = (...events: MessageView[]): MessageStreamFrame => ({ kind: 'baseline', events, order: events.map(event => event.id) })
const upsert = (...events: MessageView[]): MessageStreamFrame => ({ kind: 'upsert', events, order: events.map(event => event.id) })

describe('useTaskConversation', () => {
  it('sem tarefa aberta nada abre nem segue (idle)', () => {
    const { remote } = fakeHost()
    const { result } = renderHook(() => useTaskConversation({ remote, scope: SCOPE, team: TEAM, ticketId: null }))
    expect(result.current.status).toBe('idle')
    expect(remote.openTaskConversation).not.toHaveBeenCalled()
  })

  it('abre a conversa e segue SÓ o fio dela: o stream e o topicId que o host mandou', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useTaskConversation({ remote: host.remote, scope: SCOPE, team: TEAM, ticketId: 't-1' }))
    expect(result.current.status).toBe('loading')
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    expect(host.remote.openTaskConversation).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp', ticketId: 't-1' })
    expect(result.current.conversation).toMatchObject({ topicId: 'task:t-1', title: 'Post de sexta', caring: [{ personaId: 'bia', name: 'Bia' }] })
    await waitFor(() => { expect(host.requests).toHaveLength(1) })
    expect(host.requests[0]).toMatchObject({ streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, topicId: 'task:t-1' })
  })

  it('as mensagens chegam pelo baseline e crescem pelos quadros ao vivo (streaming como na DM)', async () => {
    const host = fakeHost()
    host.push(baseline(message('m1', 1, 'Oi, Bia')))
    const { result } = renderHook(() => useTaskConversation({ remote: host.remote, scope: SCOPE, team: TEAM, ticketId: 't-1' }))
    await waitFor(() => { expect(result.current.messages.map(row => row.body)).toEqual(['Oi, Bia']) })
    act(() => { host.push(upsert(message('m2', 2, 'Já vejo isso', 'bia'))) })
    await waitFor(() => { expect(result.current.messages.map(row => row.body)).toEqual(['Oi, Bia', 'Já vejo isso']) })
  })

  it('marca o fio como lido com a maior seq vista, sem repetir e sem voltar', async () => {
    const host = fakeHost()
    host.push(baseline(message('m1', 4, 'a'), message('m2', 7, 'b')))
    renderHook(() => useTaskConversation({ remote: host.remote, scope: SCOPE, team: TEAM, ticketId: 't-1' }))
    await waitFor(() => { expect(host.remote.markTaskThreadRead).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'pp', ticketId: 't-1', seq: 7 }) })
    act(() => { host.push(upsert(message('m1', 4, 'a editada'))) }) // uma seq que não passa da já lida
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(host.remote.markTaskThreadRead).toHaveBeenCalledTimes(1)
    act(() => { host.push(upsert(message('m3', 9, 'c'))) })
    await waitFor(() => { expect(host.remote.markTaskThreadRead).toHaveBeenLastCalledWith(expect.objectContaining({ seq: 9 })) })
  })

  it('escrever vai ao stream e ao tópico da tarefa, com a pessoa como autora e sem texto vazio', async () => {
    const host = fakeHost()
    const { result } = renderHook(() => useTaskConversation({ remote: host.remote, scope: SCOPE, team: TEAM, ticketId: 't-1', newId: () => 'msg-1' }))
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    await act(async () => { await result.current.send('  Pode ajustar a legenda?  ', ['att-1']) })
    expect(host.remote.postMessage).toHaveBeenCalledWith({
      id: 'msg-1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', subjectId: 'ana',
      body: 'Pode ajustar a legenda?', attachmentIds: ['att-1'], topicId: 'task:t-1',
    })
    await act(async () => { await result.current.send('   ') })
    expect(host.remote.postMessage).toHaveBeenCalledTimes(1)
  })

  it('o host não recebeu: o envio recusa (o campo diz "não enviado"), nunca finge que foi', async () => {
    const host = fakeHost({ postMessage: vi.fn(() => { throw new Error('sem rede') }) })
    const { result } = renderHook(() => useTaskConversation({ remote: host.remote, scope: SCOPE, team: TEAM, ticketId: 't-1' }))
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    await expect(result.current.send('oi')).rejects.toThrow('sem rede')
  })

  it('tarefa que não abre (erro do host, resposta fora do combinado ou host sem os remotes) = error; "tentar de novo" abre de novo', async () => {
    const open = vi.fn().mockRejectedValueOnce(new Error('Tarefa não encontrada.')).mockResolvedValue(OPEN)
    const host = fakeHost({ openTaskConversation: open })
    const { result } = renderHook(() => useTaskConversation({ remote: host.remote, scope: SCOPE, team: TEAM, ticketId: 't-9' }))
    await waitFor(() => { expect(result.current.status).toBe('error') })
    act(() => { result.current.retry() })
    await waitFor(() => { expect(result.current.status).toBe('ready') })
    expect(open).toHaveBeenCalledTimes(2)

    const unusable = renderHook(() => useTaskConversation({ remote: fakeHost({ openTaskConversation: async () => ({ streamKind: 'task' }) }).remote, scope: SCOPE, team: TEAM, ticketId: 't-1' }))
    await waitFor(() => { expect(unusable.result.current.status).toBe('error') })

    const old = renderHook(() => useTaskConversation({ remote: { postMessage: () => undefined }, scope: SCOPE, team: TEAM, ticketId: 't-1' }))
    await waitFor(() => { expect(old.result.current.status).toBe('error') })
  })

  it('trocar de tarefa começa do zero: mensagens da anterior não ficam; fechar solta o stream', async () => {
    const host = fakeHost()
    host.push(baseline(message('m1', 1, 'da tarefa 1')))
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useTaskConversation({ remote: host.remote, scope: SCOPE, team: TEAM, ticketId: id }), { initialProps: { id: 't-1' as string | null } })
    await waitFor(() => { expect(result.current.messages).toHaveLength(1) })
    rerender({ id: 't-2' })
    expect(result.current.messages).toEqual([])
    expect(result.current.status).toBe('loading')
    rerender({ id: null })
    expect(result.current.status).toBe('idle')
    expect(result.current.conversation).toBeUndefined()
  })
})

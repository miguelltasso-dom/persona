// @vitest-environment jsdom
// TEAM-8c: a PESSOA opina por postMessage({ ...campos normais, opinionOn: { requestId } }) (Anvil, tests/person-opinion.host.spec.ts). O composer manda
// options.opinionFor; o live store põe `opinionOn` na chamada do host, e a retentativa de "Não enviado" leva o MESMO pedido. Sem opinionFor, nada muda.
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })
const fail = (): Promise<Result> => Promise.resolve({ ok: false, error: { code: 'unavailable', message: 'sem conexão com a equipe' } })

function build(postMessage: () => Promise<Result>) {
  const stream = {
    async* [Symbol.asyncIterator]() {
      yield { kind: 'baseline', events: [], order: [] }
      await new Promise<void>(() => {})
    },
  }
  const host: Record<string, unknown> = {
    listProjects: () => ok([{ id: 'proj-pessoal' }]),
    listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
    getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
    ping: () => ok({ protocol: 1 }),
    getOverviewNow: () => ok({ personas: [] }),
    getWhileAway: () => ok({ events: [] }),
    getOverview: () => ok({ needsYou: [], inProgress: [] }),
    listTeam: () => ok({
      personas: [{ id: 'p-atlas', name: 'Coordenação', title: 'Coordenação', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: ['coordination'], canRecruit: false }],
      members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
    }),
    listTasks: () => ok([]),
    listMessages: () => ok({ events: [] }),
    listDms: () => ok([]),
    markVisit: () => ok(true),
    followMessages: () => stream,
    listApprovals: () => ok([]),
    listGestorPlans: () => ok([]),
    postMessage,
  }
  return host
}

let live: PersonaLiveStore | undefined
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => {
  cleanup()
  live?.dispose()
  live = undefined
  vi.useRealTimers()
})

type Sent = { opinionOn?: { requestId: string }; fanout?: string; body: string; streamKind: string }
const lastSent = (postMessage: ReturnType<typeof vi.fn>): Sent => (postMessage.mock.calls[postMessage.mock.calls.length - 1] as unknown as [Sent])[0]

describe('persona-live-store: a opinião da pessoa', () => {
  it('opinionFor vira opinionOn: { requestId } na chamada do host (sem fanout, sem inventar campo)', async () => {
    const postMessage = vi.fn(() => ok({ id: 'msg-1' }))
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await live.postChannelMessage('Prefiro a verde', [], { opinionFor: 'req-1' })
    const sent = lastSent(postMessage)
    expect(sent).toMatchObject({ body: 'Prefiro a verde', streamKind: 'channel', opinionOn: { requestId: 'req-1' } })
    expect('fanout' in sent).toBe(false)
  })

  it('mensagem comum não leva opinionOn', async () => {
    const postMessage = vi.fn(() => ok({ id: 'msg-1' }))
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await live.postChannelMessage('Oi, equipe')
    expect('opinionOn' in lastSent(postMessage)).toBe(false)
  })

  it('o host recusou e a pessoa tenta de novo: a retentativa vai para o MESMO pedido', async () => {
    const postMessage = vi.fn(fail)
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await live.postChannelMessage('Prefiro a verde', [], { opinionFor: 'req-9' })
    const failedId = live.observable.getSnapshot().failedSends?.[0]?.message.id as string
    expect(failedId).toBeTruthy()
    postMessage.mockImplementation(() => ok({ id: 'msg-2' }))
    await live.retryFailedSend?.(failedId)
    expect(lastSent(postMessage)).toMatchObject({ body: 'Prefiro a verde', opinionOn: { requestId: 'req-9' } })
    expect(live.observable.getSnapshot().failedSends ?? []).toHaveLength(0)
  })

  it('a retentativa de uma mensagem comum continua sem opinionOn', async () => {
    const postMessage = vi.fn(fail)
    live = createPersonaLiveStore(build(postMessage) as never)
    await live.bootstrap(() => {})
    await live.postChannelMessage('Mensagem comum')
    const failedId = live.observable.getSnapshot().failedSends?.[0]?.message.id as string
    postMessage.mockImplementation(() => ok({ id: 'msg-3' }))
    await live.retryFailedSend?.(failedId)
    expect('opinionOn' in lastSent(postMessage)).toBe(false)
  })
})

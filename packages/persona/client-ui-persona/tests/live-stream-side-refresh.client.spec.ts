// @vitest-environment jsdom
// Gauge SB-7/GES-6: a mensagem chega pelo stream, mas o cartão do plano do Gestor e as decisões novas só apareciam
// depois de F5. Agora uma mensagem nova do stream dispara (com debounce) a releitura de planos e aprovações.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPersonaLiveStore, type PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { hostMessage } from './message-view-fixture.client.ts'

type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }
const ok = (value: unknown): Promise<Result> => Promise.resolve({ ok: true, value })

const PLAN = {
  id: 'plan-1',
  workspaceId: 'ws',
  gestorId: 'p-atlas',
  action: 'assemble',
  scopeKey: 'site',
  summary: 'Vou contratar 4 personas.',
  reason: 'Você pediu um time para o Site.',
  status: 'proposed',
  createdAt: '2026-11-04T12:00:00.000Z',
}

/** Stream que o teste empurra à mão: uma linha de base vazia, depois o que o host "enviar". */
function controllableStream() {
  const queue: unknown[] = []
  let wake: (() => void) | undefined
  const push = (frame: unknown): void => { queue.push(frame); wake?.() }
  const iterable = {
    async* [Symbol.asyncIterator]() {
      yield { kind: 'baseline', events: [], order: [] }
      for (;;) {
        while (queue.length > 0) yield queue.shift()
        await new Promise<void>((resolve) => { wake = resolve })
      }
    },
  }
  return { push, iterable }
}

function build() {
  const stream = controllableStream()
  const plans: unknown[] = []
  const approvals: unknown[] = []
  const listGestorPlans = vi.fn(() => ok(plans.map(plan => ({ ...(plan as object) }))))
  const listApprovals = vi.fn(() => ok(approvals.map(card => ({ ...(card as object) }))))
  const host: Record<string, unknown> = {
    listProjects: () => ok([{ id: 'proj-pessoal' }]),
    listChannels: () => ok([{ id: 'geral', name: 'geral' }]),
    getOnboarding: () => ok({ firstUse: false, completed: true, personalProjectId: 'proj-pessoal', hasPersonalProject: true }),
    ping: () => ok({ protocol: 1 }),
    getOverviewNow: () => ok({ personas: [] }),
    getWhileAway: () => ok({ events: [] }),
    getOverview: () => ok({ needsYou: [], inProgress: [] }),
    listTeam: () => ok({
      personas: [{ id: 'p-atlas', name: 'Coordenação', title: 'Coordenação', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: ['coordination', 'team_manager'], canRecruit: true }],
      members: [{ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' }],
    }),
    listTasks: () => ok([]),
    listMessages: () => ok({ events: [] }),
    listDms: () => ok([]),
    markVisit: () => ok(true),
    followMessages: () => stream.iterable,
    listApprovals,
    listGestorPlans,
  }
  return { host, stream, plans, approvals, listGestorPlans, listApprovals }
}

let live: PersonaLiveStore | undefined
beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => {
  live?.dispose()
  live = undefined
  vi.useRealTimers()
})

describe('o stream dispara a releitura de planos e decisões', () => {
  it('um plano proposto durante a sessão aparece sem recarregar', async () => {
    const built = build()
    live = createPersonaLiveStore(built.host as never)
    await live.bootstrap(() => {})
    expect(live.observable.getSnapshot().gestorPlansById['plan-1']).toBeUndefined()

    // o host grava o plano e a mensagem da Coordenação com o marcador chega pelo stream
    built.plans.push(PLAN)
    built.stream.push({
      kind: 'upsert',
      events: [hostMessage({ id: 'm1', seq: 1, actorId: 'p-atlas', body: 'Vou contratar 4 personas.\n\n[[gestor-plan:plan-1]]', subjectId: 't1', occurredAt: '2026-11-04T12:00:01.000Z' })],
      order: ['m1'],
    })
    await vi.advanceTimersByTimeAsync(1_500)
    await vi.waitFor(() => { expect(live!.observable.getSnapshot().gestorPlansById['plan-1']?.status).toBe('proposed') })
  })

  it('uma proposta nova de aprovação entra na lista de decisões sem F5', async () => {
    const built = build()
    live = createPersonaLiveStore(built.host as never)
    await live.bootstrap(() => {})
    expect(live.observable.getSnapshot().decisions ?? []).toHaveLength(0)

    built.approvals.push({ id: 'vault-1', kind: 'vault', title: 'Chave do Stripe', question: 'Guardar a chave no Cofre?', status: 'pending', personaId: 'p-atlas', personaName: 'Coordenação' })
    built.stream.push({
      kind: 'upsert',
      events: [hostMessage({ id: 'm2', seq: 2, actorId: 'p-atlas', body: 'Posso guardar a chave no Cofre?', subjectId: 't1', occurredAt: '2026-11-04T12:00:02.000Z' })],
      order: ['m2'],
    })
    await vi.advanceTimersByTimeAsync(1_500)
    await vi.waitFor(() => { expect((live!.observable.getSnapshot().decisions ?? []).length).toBeGreaterThan(0) })
  })

  it('várias mensagens seguidas viram uma só releitura (debounce)', async () => {
    const built = build()
    live = createPersonaLiveStore(built.host as never)
    await live.bootstrap(() => {})
    const before = built.listGestorPlans.mock.calls.length
    for (const n of [1, 2, 3, 4]) {
      built.stream.push({
        kind: 'upsert',
        events: [hostMessage({ id: `m${String(n)}`, seq: n, actorId: 'p-atlas', body: `linha ${String(n)}`, subjectId: 't1', occurredAt: `2026-11-04T12:00:0${String(n)}.000Z` })],
        order: [`m${String(n)}`],
      })
    }
    await vi.advanceTimersByTimeAsync(3_000)
    await vi.waitFor(() => { expect(built.listGestorPlans.mock.calls.length).toBeGreaterThan(before) })
    expect(built.listGestorPlans.mock.calls.length - before).toBeLessThanOrEqual(2)
  })

  it('a linha de base inicial não dispara releitura extra', async () => {
    const built = build()
    live = createPersonaLiveStore(built.host as never)
    await live.bootstrap(() => {})
    const before = built.listGestorPlans.mock.calls.length
    await vi.advanceTimersByTimeAsync(3_000)
    expect(built.listGestorPlans.mock.calls.length).toBe(before)
  })
})

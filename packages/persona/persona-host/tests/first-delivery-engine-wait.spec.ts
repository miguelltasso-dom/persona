/**
 * DET-1 (P0 v1.1): a first delivery asked BEFORE the engines have been detected must wait, honestly, and must never be sealed "ready"
 * (celebrated) with ZERO model turns. Measured by Probe on the installed H2 #3: detection took 1–3 min on a loaded machine and the
 * request made earlier celebrated in < 1 s with an empty `turn_ledger`.
 */
import { Context } from '@deepseek-ai/cordis'
import { createFakeRunner, RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { afterEach, expect, it, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { FIRST_DELIVERY_EVENT_ID, FIRST_DELIVERY_MILESTONE_EVENT_ID } from '../src/onboarding.ts'
import type { CompleteOnboardingRequest } from '../src/types.ts'

const scope = { workspaceId: 'ws', projectId: 'pp' }
const contexts: Context[] = []
const at = '2026-11-04T10:00:00.000Z'
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const ONBOARDING: CompleteOnboardingRequest = {
  workspaceId: 'ws',
  personalProjectId: 'pp',
  displayName: 'Ana',
  team: [{
    name: 'Guia', title: 'Coordenação', description: 'Triagem.', personality: 'Calma.',
    instructions: 'Receba o time.', avatarKind: 'gallery', avatarRef: 'guia',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: true,
    systemRoles: ['coordination'],
  }, {
    name: 'Bento', title: 'Engenharia', description: 'Implementa.', personality: 'Direto.',
    instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false,
    systemRoles: [],
  }],
  templateIds: [],
  runnerChoices: ['dsh'],
  cofreSeed: 'Agência Ponto — estúdio de sites.',
}

type Readiness = { state: 'ready' | 'checking' | 'unavailable'; reason: 'none_connected' | null }

function open(readiness: () => Readiness): { h: PersonaHost; turns: () => number } {
  const ctx = new Context()
  contexts.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: '', engineRetryPollMs: 0, remoteTeamPollMs: 0 })
  h.orchestration.now = () => at
  let turns = 0
  h.orchestration.runnerFactory = vi.fn(async () => {
    const runner = createFakeRunner()
    return {
      ...runner,
      deliver: async (...args: Parameters<typeof runner.deliver>) => {
        turns += 1
        await runner.deliver(...args)
      },
    }
  })
  h.orchestration.engineReadinessOf = readiness
  return { h, turns: () => turns }
}

function geral(h: PersonaHost) {
  return h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'owner', afterSeq: 0, limit: 100 }).events
}

for (const state of ['checking', 'unavailable'] as const) {
  it(`DET-1: asking the first delivery while engines are ${state} defers it honestly — never ready, never a milestone, zero turns`, async () => {
    let readiness: Readiness = { state, reason: state === 'checking' ? null : 'none_connected' }
    const { h, turns } = open(() => readiness)
    await h.completeOnboarding(ONBOARDING)
    await h.orchestration.flush('pp')

    const delivery = h.getFirstDelivery(scope)
    expect(delivery.status).not.toBe('ready')
    expect(delivery.feedEventId).not.toBe(FIRST_DELIVERY_MILESTONE_EVENT_ID)
    expect(h.events.has(FIRST_DELIVERY_MILESTONE_EVENT_ID)).toBe(false)
    expect(turns()).toBe(0)
    expect(h.ledger.list({ projectId: 'pp' })).toEqual([])
    // The ask is kept (no loss), waits as a retained trigger and the person is told on the wire.
    expect(h.events.has(FIRST_DELIVERY_EVENT_ID)).toBe(true)
    expect(h.getEngineStatus(scope).pending).toBe(1)
    expect(geral(h).some(event => event.type === 'no_engine_ready')).toBe(true)
    expect(h.firstDeliveryWaitsForEngine('pp')).toBe(true)

    // The deferral is not a terminal state: it stays "working" (honest wait), never "failed" while only waiting.
    expect(delivery.status).toBe('working')

    // Detection settles: the SAME ask runs once, with a real turn, and only then does the milestone appear.
    readiness = { state: 'ready', reason: null }
    h.orchestration.resumeEngineTriggers('pp')
    await h.orchestration.flush('pp')
    const after = h.getFirstDelivery(scope)
    expect(after.status).toBe('ready')
    expect(turns()).toBeGreaterThanOrEqual(1)
    expect(h.ledger.list({ projectId: 'pp' }).length).toBeGreaterThanOrEqual(1)
    expect(geral(h).filter(event => event.id === FIRST_DELIVERY_MILESTONE_EVENT_ID)).toHaveLength(1)
    expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
  })
}

it('DET-1: startFirstDelivery while the engine is still being detected keeps waiting — it never seals the delivery failed or ready', async () => {
  let readiness: Readiness = { state: 'checking', reason: null }
  const { h, turns } = open(() => readiness)
  await h.completeOnboarding(ONBOARDING)
  const first = await h.startFirstDelivery(scope)
  const second = await h.startFirstDelivery(scope) // repeated calls while waiting
  expect(first.started).toBe(true)
  expect(second.started).toBe(true)
  expect(h.getFirstDelivery(scope).status).toBe('working')
  expect(h.listTasks(scope)).toEqual([])
  expect(turns()).toBe(0)
  expect(h.events.has(FIRST_DELIVERY_MILESTONE_EVENT_ID)).toBe(false)

  readiness = { state: 'ready', reason: null }
  h.orchestration.resumeEngineTriggers('pp')
  await h.orchestration.flush('pp')
  expect(h.getFirstDelivery(scope).status).toBe('ready')
  expect(turns()).toBeGreaterThanOrEqual(1)
  expect(h.listTasks(scope)).toHaveLength(1)
})

it('DET-1: a delivery that really ran once and failed on the engine is still sealed failed (the wait exemption is only for a retained ask)', async () => {
  const { h } = open(() => ({ state: 'ready', reason: null }))
  h.orchestration.runnerFactory = vi.fn(async () => { throw new RunnerResolveError('quota_exhausted', 'claude') })
  await h.completeOnboarding(ONBOARDING)
  await h.orchestration.flush('pp')
  expect(h.getFirstDelivery(scope).status).toBe('failed')
  expect(h.firstDeliveryWaitsForEngine('pp')).toBe(false)
})

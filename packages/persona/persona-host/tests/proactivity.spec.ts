import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { silenceUntilOf } from '../src/proactivity.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seed(h: PersonaHost, name = 'Bento'): { scope: { workspaceId: string; projectId: string }; personaId: string } {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name, title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  return { scope: { workspaceId: 'ws', projectId: 'pp' }, personaId: 'p1' }
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    title: 'Implementar faixa Agora',
    decisionId: 'd1',
    mandate: {
      strength: 'explicit',
      policyVersion: 'v1',
      basis: { via: 'listed' },
      actor: { source: 'channel', id: 'ana' },
      scope: 'small',
    },
    channels: [],
    assignments: [{ id: 'a1', state: 'running', createdAt: '2026-01-01T00:00:00.000Z' }],
    inputs: [],
    undelivered: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    origin: { triggerId: 'e1', triggerIds: ['e1'] },
    execution: { name: 'Bento', directory: '.', assignment: 'go' },
    ...overrides,
  }
}

it('silenceUntilOf is 0 outside the window and the next end inside it', () => {
  expect(silenceUntilOf('2026-11-03T15:00:00.000Z', undefined, undefined)).toBe(0)
  expect(silenceUntilOf('2026-11-03T15:00:00.000Z', '22:00', '07:00')).toBe(0)
  expect(silenceUntilOf('2026-11-03T23:00:00.000Z', '22:00', '07:00'))
    .toBe(Date.parse('2026-11-04T07:00:00.000Z'))
  expect(silenceUntilOf('2026-11-03T03:00:00.000Z', '22:00', '07:00'))
    .toBe(Date.parse('2026-11-03T07:00:00.000Z'))
})

it('creates a daily initiative routine and fires it on the scheduler tick', () => {
  const h = host()
  const { scope, personaId } = seed(h)
  const routine = h.listRoutines(scope).find(item => item.id === `initiative:${personaId}`)
  expect(routine?.rrule).toBe('FREQ=DAILY;BYHOUR=9')
  expect(routine?.timeZone).toBe('UTC')
  h.scheduleRoutine({
    ...scope, id: `initiative:${personaId}`, runId: 'run-1', scheduledFor: '2020-01-01T00:00:00.000Z',
  })
  const tick = h.tickProactivity({ ...scope, leaseUntil: '2099-01-01T00:00:00.000Z', stallAfterMs: 60_000 })
  expect(tick.initiatives).toBe(1)
  const now = h.getOverviewNow(scope)
  expect(now.personas[0]?.currentTask).toMatch(/projeto/i)
  const away = h.getWhileAway(scope)
  expect(away.events.some(item => item.kind === 'proposal')).toBe(true)
  // Reading does not consume the summary (P1-7): a client that refreshes keeps seeing it until the person dismisses it.
  expect(h.getWhileAway(scope).events).toEqual(away.events)
  expect(h.dismissWhileAway(scope)).toBe(true)
  expect(h.getWhileAway(scope).events).toEqual([])
})

it('skips initiative when asked, over budget, or in a silence window', () => {
  const h = host()
  const { scope, personaId } = seed(h)
  h.setAutonomy({
    ...scope, personaId, mode: 'asked', proposalBudget: 3, tokenBudget: 1, executionBudget: 1,
    silenceStart: '', silenceEnd: '',
  })
  expect(h.fireProactiveEvent({ ...scope, title: 'PR aberto', subjectId: 'pr-1' })).toEqual([])
  h.setAutonomy({
    ...scope, personaId, mode: 'propose', proposalBudget: 1, tokenBudget: 1, executionBudget: 1,
    silenceStart: '', silenceEnd: '',
  })
  expect(h.fireProactiveEvent({ ...scope, title: 'PR aberto', subjectId: 'pr-1' })).toEqual([personaId])
  expect(h.fireProactiveEvent({ ...scope, title: 'PR aberto', subjectId: 'pr-2' })).toEqual([])
  h.setAutonomy({
    ...scope, personaId, mode: 'propose', proposalBudget: 9, tokenBudget: 1, executionBudget: 1,
    silenceStart: '00:00', silenceEnd: '23:59',
  })
  expect(h.fireProactiveEvent({ ...scope, title: 'erro', subjectId: 'e1' })).toEqual([])
})

it('pauseTeam stops initiative routines from firing', () => {
  const h = host()
  const { scope, personaId } = seed(h)
  h.scheduleRoutine({
    ...scope, id: `initiative:${personaId}`, runId: 'run-1', scheduledFor: '2020-01-01T00:00:00.000Z',
  })
  expect(h.pauseTeam(scope)).toBe(true)
  expect(h.tickProactivity({ ...scope, leaseUntil: '2099-01-01T00:00:00.000Z', stallAfterMs: 1 }).initiatives).toBe(0)
})

it('Vigia audit records a stalled running ticket without posting to a channel', () => {
  const h = host()
  const { scope } = seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket())
  const tick = h.tickProactivity({ ...scope, leaseUntil: '2099-01-01T00:00:00.000Z', stallAfterMs: 1 })
  expect(tick.warnings).toBeGreaterThan(0)
  const away = h.getWhileAway(scope)
  expect(away.events.some(item => item.kind === 'watchdog' && item.taskId === 't1')).toBe(true)
  const now = h.getOverviewNow(scope)
  const bento = now.personas.find(item => item.name === 'Bento')
  expect(bento?.state).toBe('stuck')
  expect(bento?.currentTaskId).toBe('t1')
  expect(bento?.queueCount).toBe(1)
})

it('while-away lists a completed ticket with a deep link', () => {
  const h = host()
  const { scope } = seed(h)
  h.orchestration.runtime('pp').repo.tickets.save(ticket({
    ended: { at: '2026-11-03T18:00:00.000Z', by: 'executor', outcome: 'completed' },
    assignments: [{ id: 'a1', state: 'ended', createdAt: '2026-11-03T17:00:00.000Z' }],
    updatedAt: '2026-11-03T18:00:00.000Z',
  }))
  const away = h.getWhileAway(scope)
  expect(away.events.some(item => item.kind === 'delivery' && item.taskId === 't1')).toBe(true)
})

it('autonomy RPC persists and overview counts idle, deliveries, accepted proposals', () => {
  const h = host()
  const { scope, personaId } = seed(h)
  expect(h.getAutonomy({ ...scope, personaId }).mode).toBe('propose')
  const saved = h.setAutonomy({
    ...scope, personaId, mode: 'act', proposalBudget: 5, tokenBudget: 100, executionBudget: 2,
    silenceStart: '22:00', silenceEnd: '07:00',
  })
  expect(saved.mode).toBe('act')
  expect(h.getAutonomy({ ...scope, personaId }).proposalBudget).toBe(5)
  const day = h.orchestration.now().slice(0, 10) // the host's own (injected) clock, the one the strip counts "today" by
  h.orchestration.runtime('pp').repo.tickets.save(ticket({
    ended: { at: `${day}T10:00:00.000Z`, by: 'executor', outcome: 'completed' },
    assignments: [{ id: 'a1', state: 'ended', createdAt: `${day}T09:00:00.000Z` }],
    updatedAt: `${day}T10:00:00.000Z`,
  }))
  h.proactivity.repos.recordFire({
    projectId: 'pp', id: 'accepted-1', personaId, source: 'event', kind: 'initiative',
    at: `${day}T11:00:00.000Z`, title: 'Aceita', ticketId: 't-acc',
  })
  const now = h.getOverviewNow(scope)
  const bento = now.personas[0]
  expect(bento?.state).toBe('resting')
  expect(bento?.deliveriesToday).toBe(1)
  expect(bento?.proposalsAcceptedToday).toBe(1)
  expect(bento?.idleMinutes).toBeGreaterThanOrEqual(0)
})

it('initiative routine uses the persona weekly start hour and timezone', () => {
  const h = host()
  const { scope } = seed(h)
  h.product.createPersona({
    id: 'p2', workspaceId: 'ws', name: 'Iris', title: 'Design',
    description: 'Desenha.', personality: 'Calma.', instructions: 'Mostre.',
    avatar: { kind: 'gallery', ref: 'iris' },
    runner: { kind: 'dsh', model: 'm' },
    tools: {}, skills: [], limits: {}, systemRoles: [],
    canRecruit: false, createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z',
    createdBy: 'ana',
    schedule: { timeZone: 'America/Sao_Paulo', weeklyHours: [{ day: 1, start: '14:00', end: '18:00' }] },
  }, 'pp')
  expect(h.ensureInitiativeRoutines(scope)).toBe(1)
  const routine = h.listRoutines(scope).find(item => item.id === 'initiative:p2')
  expect(routine?.rrule).toBe('FREQ=DAILY;BYHOUR=14')
  expect(routine?.timeZone).toBe('America/Sao_Paulo')
})

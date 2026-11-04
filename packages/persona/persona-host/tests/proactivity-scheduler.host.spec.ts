import { latestAssignment, ticketGoal } from '@deepseek-ai/dsh-persona-engine'
import { ProactivityRepos, RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { ProactivityHost } from '../src/proactivity.ts'
import { createProactivityScheduler } from '../src/proactivity-wire.ts'
import type { ProactivityScheduler } from '../src/proactivity-scheduler.ts'
import { TeamStateBook } from '../src/team-state.ts'
import { bindHostFile, it } from './host-harness.ts'

/** The scheduler on the REAL host wiring (pipeline, orchestration, scripted runner); only the clock is fake. */
const { host } = bindHostFile()
const START = Date.parse('2026-11-03T08:00:00.000Z')

interface Live {
  readonly h: PersonaHost
  readonly scheduler: ProactivityScheduler
  readonly routines: RoutineRepos
  readonly clock: { ms: number }
  readonly modelCalls: { count: number }
  readonly scope: { workspaceId: string; projectId: string }
  advance(ms: number): void
  settle(): Promise<void>
}

function live(h: PersonaHost): Live {
  const clock = { ms: START }
  const nowIso = (): string => new Date(clock.ms).toISOString()
  h.orchestration.now = nowIso
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name] of [['p1', 'Bento'], ['p2', 'Iris']] as const) {
    h.createPersona({
      id, workspaceId: 'ws', projectId: 'pp', name, title: 'Engenharia',
      description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
      runnerModel: 'm', canRecruit: false, createdBy: 'ana',
    })
  }
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
  const routines = new RoutineRepos(h.store, nowIso)
  const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
  proactivity.ensureAllInitiativeRoutines('pp')
  const modelCalls = { count: 0 }
  const original = h.orchestration.runnerFactory
  h.orchestration.runnerFactory = (request) => { modelCalls.count += 1; return original(request) }
  const scheduler = createProactivityScheduler({
    product: h.product,
    events: h.events,
    routines,
    proactivity,
    screens: h.screens.screens,
    orchestration: h.orchestration,
    boards: h.boards,
    teamState: new TeamStateBook(h.screens.screens, routines, nowIso),
    governance: h.governance,
    draftFiles: h.draftFiles,
  }, { nowMs: () => clock.ms, cycleMs: 0 })
  return {
    h, scheduler, routines, clock, modelCalls,
    scope: { workspaceId: 'ws', projectId: 'pp' },
    advance(ms) { clock.ms += ms },
    async settle() {
      await scheduler.whenIdle()
      await h.orchestration.flush('pp')
    },
  }
}

function channelBodies(h: PersonaHost): string[] {
  return h.listMessages({ workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(message => message.body)
}

/** What a crash or a full slot leaves behind: an open ticket, running assignment, no report, no done line. */
function strandedTicket(r: Live, id = 't-stranded'): void {
  const at = new Date(START - 120_000).toISOString()
  r.h.orchestration.runtime('pp').repo.tickets.save({
    id, title: 'Relatório do dia', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: `${id}-a1`, state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  })
}

it('a ticket nobody is executing is run by the scheduler through the real pipeline and finishes in #geral', async () => {
  const r = live(host())
  strandedTicket(r)
  const rt = r.h.orchestration.runtime('pp')
  expect(r.h.events.has('coord-t-stranded-done')).toBe(false)
  const report = await r.scheduler.cycle()
  await r.settle()
  expect(report.projects[0]?.assigned).toEqual(['t-stranded'])
  const after = rt.repo.tickets.get('t-stranded')
  expect(after === undefined ? undefined : latestAssignment(after)?.report?.state).toBe('ready')
  expect(r.h.events.has('coord-t-stranded-done')).toBe(true)
  expect(channelBodies(r.h).some(line => line.startsWith('Em andamento: Relatório do dia'))).toBe(true)
  const audits = r.h.proactivity.repos.auditsSince('pp', '1970-01-01T00:00:00.000Z').map(row => row.detail)
  expect(audits.some(line => /Bento retomou “Relatório do dia”, que estava parada/.test(line))).toBe(true)
  await r.scheduler.cycle() // done: nothing left to drive
  await r.settle()
  expect(r.modelCalls.count).toBe(1)
})

it('a ticket that waits for a person is never touched by the team', async () => {
  const r = live(host())
  r.h.orchestration.liveQuestion = 'Qual cor usamos no relatório?'
  r.h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: '@Bento Faça o relatório do dia', actorId: 'ana', subjectId: '',
  })
  await r.h.orchestration.flush('pp')
  const asked = r.h.orchestration.runtime('pp').repo.tickets.list()[0]
  expect(asked?.attention?.question).toBe('Qual cor usamos no relatório?')
  const calls = r.modelCalls.count
  r.advance(10 * 60_000)
  const report = await r.scheduler.cycle()
  await r.settle()
  expect(report.projects[0]).toMatchObject({ assigned: [], modelStarts: 0 })
  expect(r.modelCalls.count).toBe(calls)
})

it('a due routine becomes a real Ticket for its persona and is done in #geral', async () => {
  const r = live(host())
  r.routines.create({ id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Resumo do dia', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
  r.h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'p2', prompt: 'Resuma o que a equipe entregou ontem.' })
  r.advance(2 * 3_600_000)
  const report = await r.scheduler.cycle()
  await r.settle()
  expect(report.projects[0]).toMatchObject({ routinesRun: 3, modelStarts: 1, assigned: [] }) // 2 initiatives (no model) + the custom routine
  const tickets = r.h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.execution?.name).toBe('Iris')
  expect(tickets[0] === undefined ? undefined : latestAssignment(tickets[0])?.report?.state).toBe('ready')
  const lines = channelBodies(r.h)
  expect(lines).toContain('@Iris Resuma o que a equipe entregou ontem.')
  expect(lines.some(line => line.startsWith('Em andamento:'))).toBe(true)
  await r.scheduler.cycle()
  await r.settle()
  expect(r.h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1) // exactly once
})

it('a routine is its own Ticket even while another ticket is still open on #geral (not a follow-up)', async () => {
  const r = live(host())
  r.h.postMessage({
    id: 'm1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral',
    body: '@Bento Faça o relatório do dia', actorId: 'ana', subjectId: '',
  })
  await r.h.orchestration.flush('pp')
  const first = r.h.orchestration.runtime('pp').repo.tickets.list()
  expect(first).toHaveLength(1)
  expect(first[0]?.ended).toBeUndefined() // still open: waiting for review, subscribed to the #geral thread
  r.routines.create({ id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Resumo do dia', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
  r.h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'p2', prompt: 'Resuma o que a equipe entregou ontem.' })
  r.advance(2 * 3_600_000)
  const report = await r.scheduler.cycle()
  await r.settle()
  expect(report.projects[0]?.modelStarts).toBe(1)
  const tickets = r.h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets.map(item => item.execution?.name).sort()).toEqual(['Bento', 'Iris'])
  expect(r.routines.listRuns('r1').map(run => run.status)).toEqual(['done'])
})

it('an open goal and an empty queue make Coordenação plan one real Ticket', async () => {
  const r = live(host())
  r.h.boards.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  const report = await r.scheduler.cycle()
  await r.settle()
  expect(report.projects[0]?.planned).toEqual(['goal-ticket-sprint-1'])
  const tickets = r.h.orchestration.runtime('pp').repo.tickets.list()
  expect(tickets).toHaveLength(1)
  expect(tickets[0]?.title).toMatch(/Planeje o próximo passo do objetivo/)
  expect(tickets[0]?.execution?.name).toBe('Bento')
  r.advance(60_000)
  await r.scheduler.cycle()
  await r.settle()
  expect(r.h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
})

it('no goal, no routine due, nothing open ⇒ many cycles, ZERO model calls', async () => {
  const r = live(host())
  for (let i = 0; i < 20; i += 1) {
    await r.scheduler.cycle()
    r.advance(30 * 60_000)
  }
  await r.settle()
  expect(r.modelCalls.count).toBe(0)
  expect(r.h.orchestration.runtime('pp').repo.tickets.list()).toEqual([])
  expect(r.scheduler.status('pp').state).toBe('resting')
})

it('Pausar equipe through the Remote stops the real scheduler and Retomar brings it back', async () => {
  const r = live(host())
  r.h.boards.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  expect(r.h.pauseTeam(r.scope)).toBe(true)
  expect(r.h.getTeamState(r.scope).paused).toBe(true)
  // the host's own scheduler (wall clock) and this one share the persisted flag
  const paused = await r.scheduler.cycle()
  expect(paused.projects[0]?.state).toBe('paused')
  expect(r.modelCalls.count).toBe(0)
  expect(r.h.resumeTeam(r.scope).paused).toBe(false)
  await r.scheduler.cycle()
  await r.settle()
  expect(r.h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
})

it('the new Remotes answer: status, team state and a manual cycle', async () => {
  const h = host()
  const r = live(h)
  const status = h.getProactivityStatus(r.scope)
  expect(status).toMatchObject({ projectId: 'pp', state: 'resting', running: false, openGoals: 0, queued: 0 })
  const after = await h.runProactivityCycle(r.scope)
  expect(after.lastCycleAt).not.toBe('')
  expect(h.getTeamState(r.scope)).toEqual({ paused: false, pausedAt: '', resumedAt: '' })
  h.pauseTeam(r.scope)
  expect(h.getTeamState(r.scope).paused).toBe(true)
  expect(h.getTeamState(r.scope).pausedAt).not.toBe('')
  h.resumeTeam(r.scope)
  expect(h.getTeamState(r.scope).paused).toBe(false)
})

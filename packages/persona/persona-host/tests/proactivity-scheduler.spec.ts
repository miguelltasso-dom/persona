import { MemoryGoalBoard, ticketGoal, type PersonaGoal, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { ProactivityRepos, RoutineRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { ProactivityHost } from '../src/proactivity.ts'
import {
  ProactivityScheduler,
  ROUTINE_SPEC_KIND,
  withinWorkHours,
  type PostResult,
  type RoutineChargeLite,
  type SchedulerTimers,
  type TeamRequest,
} from '../src/proactivity-scheduler.ts'
import { TeamStateBook } from '../src/team-state.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const START = Date.parse('2026-11-03T08:00:00.000Z') // Tuesday

interface Rig {
  readonly h: PersonaHost
  readonly scheduler: ProactivityScheduler
  readonly clock: { ms: number }
  readonly routines: RoutineRepos
  readonly proactivity: ProactivityHost
  readonly screens: ScreenRepos
  readonly teamState: TeamStateBook
  readonly goals: MemoryGoalBoard
  readonly posts: TeamRequest[]
  readonly drives: string[]
  readonly engine: { ready: boolean }
  readonly post: { result: PostResult }
  readonly charges: Map<string, RoutineChargeLite>
  readonly scope: { workspaceId: string; projectId: string }
  advance(ms: number): void
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    title: 'Implementar faixa Agora',
    decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{ id: 'a1', state: 'running', createdAt: '2026-11-03T07:00:00.000Z' }],
    inputs: [],
    undelivered: [],
    createdAt: '2026-11-03T07:00:00.000Z',
    updatedAt: '2026-11-03T07:00:00.000Z',
    origin: { triggerId: 'e1', triggerIds: ['e1'] },
    execution: { name: 'Bento', directory: '.', assignment: 'go' },
    ...overrides,
  }
}

/** A host with one workspace, Bento (Coordenação) and Iris, and a scheduler on a fake clock with fake model ports. */
function rig(h: PersonaHost, options: { cycleMs?: number; timers?: SchedulerTimers } = {}): Rig {
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
  // The host made the initiative routines with the wall clock; rebuild them on the fake clock.
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
  const routines = new RoutineRepos(h.store, nowIso)
  const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
  proactivity.ensureAllInitiativeRoutines('pp')
  const screens = h.screens.screens
  const teamState = new TeamStateBook(screens, routines, nowIso)
  const goals = new MemoryGoalBoard()
  const posts: TeamRequest[] = []
  const drives: string[] = []
  const engine = { ready: true }
  const post: { result: PostResult } = { result: { ok: true, ticketId: 'tk' } }
  const charges = new Map<string, RoutineChargeLite>()
  const scheduler = new ProactivityScheduler({
    product: h.product,
    routines,
    proactivity,
    screens,
    events: h.events,
    teamState,
    orchestration: h.orchestration,
    chargeOf: (_workspaceId, routineId) => charges.get(routineId),
    goalsOf: (projectId): readonly PersonaGoal[] => goals.list(projectId),
    engineReady: () => engine.ready,
    postRequest: (request) => { posts.push(request); return post.result },
    driveTicket: (_projectId, ticketId) => { drives.push(ticketId); return Promise.resolve() },
  }, {
    nowMs: () => clock.ms,
    cycleMs: options.cycleMs ?? 0,
    ...(options.timers === undefined ? {} : { timers: options.timers }),
  })
  return {
    h, scheduler, clock, routines, proactivity, screens, teamState, goals, posts, drives, engine, post, charges,
    scope: { workspaceId: 'ws', projectId: 'pp' },
    advance(ms) { clock.ms += ms },
  }
}

function audits(r: Rig, kind: string): string[] {
  return r.proactivity.repos.auditsSince('pp', '1970-01-01T00:00:00.000Z').filter(row => row.kind === kind).map(row => row.detail)
}

function customRoutine(r: Rig, id = 'r1', rrule = 'FREQ=DAILY;BYHOUR=9'): void {
  r.routines.create({ id, workspaceId: 'ws', projectId: 'pp', name: 'Resumo do dia', rrule, timeZone: 'UTC', catchUp: 'run_once' })
  r.screens.put('pp', ROUTINE_SPEC_KIND, id, { personaId: 'p2', prompt: 'Resuma o que a equipe fez ontem.' })
}

it('a ticket nobody executes is driven by its persona within one cycle', async () => {
  const r = rig(host())
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  const report = await r.scheduler.cycle()
  expect(report.projects[0]?.assigned).toEqual(['t1'])
  expect(report.projects[0]?.modelStarts).toBe(1)
  expect(r.drives).toEqual(['t1'])
  expect(audits(r, 'sched:assigned')[0]).toMatch(/Bento retomou “Implementar faixa Agora”/)
  const away = r.h.getWhileAway(r.scope)
  expect(away.events.some(item => item.kind === 'watchdog' && item.taskId === 't1')).toBe(true)
})

it('a ticket touched a moment ago is left alone: its own run is starting', async () => {
  const r = rig(host())
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket({ updatedAt: new Date(START - 5_000).toISOString() }))
  await r.scheduler.cycle()
  expect(r.drives).toEqual([])
  r.advance(30_000)
  await r.scheduler.cycle()
  expect(r.drives).toEqual(['t1'])
})

it('does not drive while another run is in flight, nor tickets that wait for a person', async () => {
  const r = rig(host())
  const rt = r.h.orchestration.runtime('pp')
  rt.repo.tickets.save(ticket())
  r.h.orchestration.budget.running.set('pp', 1)
  await r.scheduler.cycle()
  expect(r.drives).toEqual([])
  r.h.orchestration.budget.running.delete('pp')
  rt.repo.tickets.save(ticket({
    attention: { id: 'att-1', question: 'Qual cor?' },
    assignments: [{ id: 'a1', state: 'running', createdAt: '2026-11-03T07:00:00.000Z', report: { state: 'waiting', summary: 'Qual cor?', at: '2026-11-03T07:30:00.000Z' } }],
  }))
  await r.scheduler.cycle()
  expect(r.drives).toEqual([])
  expect(r.scheduler.status('pp').state).toBe('resting')
})

it('stops after a few drives of the same assignment and says so', async () => {
  const r = rig(host())
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  for (let i = 0; i < 5; i += 1) {
    await r.scheduler.cycle()
    await r.scheduler.whenIdle()
    r.advance(30_000)
  }
  expect(r.drives).toEqual(['t1', 't1', 't1'])
  expect(audits(r, 'sched:retry_exhausted')[0]).toMatch(/depois de 3 tentativas/)
})

it('a due routine runs exactly once and is queued for its persona', async () => {
  const r = rig(host())
  customRoutine(r)
  await r.scheduler.cycle()
  expect(r.posts).toEqual([])
  r.advance(2 * 3_600_000) // 10:00, past the 09:00 occurrence
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
  expect(r.posts[0]).toMatchObject({ personaId: 'p2', kind: 'routine', actorId: 'routine:r1', body: '@Iris Resuma o que a equipe fez ontem.' })
  await r.scheduler.cycle()
  r.advance(60_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
  expect(r.routines.listRuns('r1').map(run => run.status)).toEqual(['done'])
  r.advance(24 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(2)
})

it('a routine without a named owner goes to the Coordenação, with its name as the instruction', async () => {
  const r = rig(host())
  r.routines.create({ id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Faxina', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
  r.advance(2 * 3_600_000)
  const report = await r.scheduler.cycle()
  expect(report.projects[0]?.routinesSkipped).toBe(0)
  expect(r.posts).toHaveLength(1)
  expect(r.posts[0]).toMatchObject({ personaId: 'p1', body: '@Bento Faça a rotina “Faxina” agora e relate com evidência.' })
})

it('a routine takes its executor from the governance charge and its own name as the instruction', async () => {
  const r = rig(host())
  r.routines.create({ id: 'r9', workspaceId: 'ws', projectId: 'pp', name: 'Fechar o caixa', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
  r.charges.set('r9', { executorPersonaId: 'p2', requiresApproval: false })
  r.advance(2 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
  expect(r.posts[0]).toMatchObject({ personaId: 'p2', body: '@Iris Faça a rotina “Fechar o caixa” agora e relate com evidência.' })
})

it('a routine that needs approval never runs on its own, and says so', async () => {
  const r = rig(host())
  r.routines.create({ id: 'r9', workspaceId: 'ws', projectId: 'pp', name: 'Pagar fornecedores', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
  r.charges.set('r9', { executorPersonaId: 'p2', requiresApproval: true })
  r.advance(2 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toEqual([])
  expect(audits(r, 'sched:routine_skipped')[0]).toMatch(/precisa da sua aprovação antes de rodar/)
})

it('a rule it cannot read is reported once and does not stop the others', async () => {
  const r = rig(host())
  customRoutine(r, 'bad', 'FREQ=YEARLY')
  customRoutine(r, 'r1')
  r.advance(2 * 3_600_000)
  await r.scheduler.cycle()
  await r.scheduler.cycle()
  expect(audits(r, 'sched:routine_bad_rule')).toHaveLength(1)
  expect(r.posts.map(post => post.actorId)).toEqual(['routine:r1'])
})

it('the daily initiative fires inside the persona work window and is skipped outside it', async () => {
  const r = rig(host())
  // Luna works Tuesday (day 2) 08:00-12:00 UTC only; Bento and Iris have no window (always available).
  const window = { timeZone: 'UTC', weeklyHours: [{ day: 2, start: '08:00', end: '12:00' }] }
  r.h.product.createPersona({
    id: 'p3', workspaceId: 'ws', name: 'Luna', title: 'Design', description: 'Desenha.', personality: 'Calma.',
    instructions: 'Mostre.', avatar: { kind: 'gallery', ref: 'luna' }, runner: { kind: 'dsh', model: 'm' },
    tools: {}, skills: [], limits: {}, systemRoles: [], canRecruit: false,
    createdAt: '2026-11-03T00:00:00.000Z', updatedAt: '2026-11-03T00:00:00.000Z', createdBy: 'ana', schedule: window,
  }, 'pp')
  r.proactivity.ensureAllInitiativeRoutines('pp')
  expect(r.routines.get('initiative:p3')?.rrule).toBe('FREQ=DAILY;BYHOUR=8')
  expect(withinWorkHours({ schedule: window }, START)).toBe(true)
  r.advance(25.5 * 3_600_000) // Wednesday 09:30
  await r.scheduler.cycle()
  expect(r.proactivity.repos.firesSince('pp', '1970-01-01T00:00:00.000Z').map(fire => fire.personaId).sort()).toEqual(['p1', 'p2'])
  expect(audits(r, 'sched:initiative_skipped')[0]).toMatch(/Luna está fora do horário de trabalho/)
  r.advance(6 * 24 * 3_600_000 - 1_800_000) // next Tuesday 08:30... plus the day's 09:00 for the others
  await r.scheduler.cycle()
  const later = r.proactivity.repos.firesSince('pp', '2026-11-05T00:00:00.000Z').map(fire => fire.personaId)
  expect(later).toContain('p3')
})

it('no goal and nothing to do ⇒ the team rests with zero model calls, cycle after cycle', async () => {
  const r = rig(host())
  let model = 0
  r.h.orchestration.runnerFactory = () => { model += 1; return Promise.reject(new Error('no model in this test')) }
  let starts = 0
  for (let i = 0; i < 12; i += 1) {
    const report = await r.scheduler.cycle()
    starts += report.projects[0]?.modelStarts ?? 0
    r.advance(2 * 3_600_000)
  }
  expect(starts).toBe(0)
  expect(model).toBe(0)
  expect(r.posts).toEqual([])
  expect(r.drives).toEqual([])
  expect(r.scheduler.status('pp').state).toBe('resting')
})

it('empty queue + open goal ⇒ Coordenação plans once, then not again until the interval passes', async () => {
  const r = rig(host())
  r.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  const report = await r.scheduler.cycle()
  expect(report.projects[0]?.planned).toEqual(['goal-ticket-sprint-1'])
  expect(r.posts).toHaveLength(1)
  expect(r.posts[0]).toMatchObject({ kind: 'plan', personaId: 'p1' })
  expect(r.posts[0]?.body).toMatch(/^@Bento Planeje o próximo passo do objetivo “Site no ar”/)
  r.advance(3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
  r.advance(6 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(2)
  expect(audits(r, 'sched:planned')).toHaveLength(2)
})

it('a goal does not plan while there is queued work, and respects silence, "só quando pedido" and budget', async () => {
  const r = rig(host())
  r.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  await r.scheduler.cycle()
  expect(r.posts).toEqual([])
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket({ ended: { at: '2026-11-03T08:00:00.000Z', by: 'executor', outcome: 'completed' } }))
  r.proactivity.setAutonomy({ projectId: 'pp', personaId: 'p1', mode: 'propose', proposalBudget: 3, tokenBudget: 1000, executionBudget: 8, silenceStart: '07:00', silenceEnd: '09:00' })
  await r.scheduler.cycle()
  expect(r.posts).toEqual([])
  expect(audits(r, 'sched:silence')[0]).toMatch(/janela de silêncio/)
  r.proactivity.setAutonomy({ projectId: 'pp', personaId: 'p1', mode: 'asked', proposalBudget: 3, tokenBudget: 1000, executionBudget: 8, silenceStart: '', silenceEnd: '' })
  await r.scheduler.cycle()
  expect(r.posts).toEqual([])
  r.proactivity.setAutonomy({ projectId: 'pp', personaId: 'p1', mode: 'propose', proposalBudget: 3, tokenBudget: 1000, executionBudget: 0, silenceStart: '', silenceEnd: '' })
  await r.scheduler.cycle()
  expect(r.posts).toEqual([])
  expect(audits(r, 'sched:budget')[0]).toMatch(/Bento usou as 0 execuções do dia/)
})

it('the daily execution budget caps how many routines one persona starts', async () => {
  const r = rig(host())
  customRoutine(r, 'r1')
  customRoutine(r, 'r2', 'FREQ=DAILY;BYHOUR=8;BYMINUTE=30')
  r.proactivity.setAutonomy({ projectId: 'pp', personaId: 'p2', mode: 'propose', proposalBudget: 3, tokenBudget: 1000, executionBudget: 1, silenceStart: '', silenceEnd: '' })
  r.advance(2 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
  expect(audits(r, 'sched:budget')[0]).toMatch(/Iris usou as 1 execuções do dia/)
})

it('token budget of the day stops new model starts', async () => {
  const h = host()
  const r = rig(h)
  const scheduler = new ProactivityScheduler({ ...r.scheduler.deps, tokensSince: () => 99_999 }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  h.orchestration.runtime('pp').repo.tickets.save(ticket())
  await scheduler.cycle()
  expect(r.drives).toEqual([])
  expect(audits(r, 'sched:budget')[0]).toMatch(/limite de tokens do dia/)
})

it('Marco M2: the responsible\'s loop is stepped ONCE per project per cycle, AFTER the pull, with the persona\'s own daily budget (the same count the routines spend)', async () => {
  const r = rig(host())
  const steps: Array<{ projectId: string; before: string[]; may: boolean[] }> = []
  let spendTwice = false
  const scheduler = new ProactivityScheduler({
    ...r.scheduler.deps,
    lead: {
      step: (projectId, budget) => {
        steps.push({ projectId, before: [...r.drives], may: [budget.may('p2')] })
        if (spendTwice) { budget.spend('p2'); budget.spend('p2'); steps.push({ projectId, before: [], may: [budget.may('p2')] }) }
      },
    },
  }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  await scheduler.cycle()
  expect(steps).toEqual([{ projectId: 'pp', before: ['t1'], may: [true] }]) // the stranded ticket was driven first (the pull), then the loop looked
  r.proactivity.setAutonomy({ projectId: 'pp', personaId: 'p2', mode: 'propose', proposalBudget: 3, tokenBudget: 1000, executionBudget: 2, silenceStart: '', silenceEnd: '' })
  spendTwice = true
  r.advance(60_000)
  await scheduler.cycle()
  expect(steps.at(-1)).toEqual({ projectId: 'pp', before: [], may: [false] }) // two turns spent = the day's budget of that persona is over
})

it('Marco M2: a loop that throws never breaks the cycle (the rest of it runs and the project is not "error")', async () => {
  const r = rig(host())
  let called = 0
  const scheduler = new ProactivityScheduler({ ...r.scheduler.deps, lead: { step: () => { called += 1; throw new Error('o quadro quebrou') } } }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  const report = await scheduler.cycle()
  expect(called, 'the loop WAS asked (the check below is not vacuous)').toBe(1)
  expect(report.projects[0]?.state).not.toBe('error')
  expect(r.drives).toEqual(['t1']) // the pull before it ran, and the cycle finished
})

it('Marco M2: a paused team or a missing engine never steps the loop (the scheduler already said why); the quiet window DOES (the loop records its own hold)', async () => {
  const r = rig(host())
  let steps = 0
  const scheduler = new ProactivityScheduler({ ...r.scheduler.deps, lead: { step: () => { steps += 1 } } }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  r.teamState.pause('pp')
  await scheduler.cycle()
  expect(steps).toBe(0)
  r.teamState.resume('pp')
  r.engine.ready = false
  await scheduler.cycle()
  expect(steps).toBe(0)
  r.engine.ready = true
  await scheduler.cycle()
  expect(steps).toBe(1)
})

it('Pausar equipe: nothing runs, it is said once, Retomar brings it back without replaying what was missed', async () => {
  const r = rig(host())
  customRoutine(r)
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  r.teamState.pause('pp')
  r.advance(2 * 3_600_000)
  for (let i = 0; i < 3; i += 1) {
    const report = await r.scheduler.cycle()
    expect(report.projects[0]?.state).toBe('paused')
  }
  expect(r.posts).toEqual([])
  expect(r.drives).toEqual([])
  expect(audits(r, 'sched:team_paused')).toHaveLength(1)
  expect(r.routines.get('r1')?.paused).toBe(true)
  r.advance(3_600_000)
  r.teamState.resume('pp')
  expect(r.routines.get('r1')?.paused).toBe(false)
  await r.scheduler.cycle()
  expect(audits(r, 'sched:team_resumed')).toHaveLength(1)
  expect(r.posts).toEqual([]) // the 09:00 occurrence was missed while paused: not replayed
  expect(r.drives).toEqual(['t1']) // but work waiting for the team moves again
  r.advance(24 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
})

it('a persona paused with /pausar is left alone', async () => {
  const r = rig(host())
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  r.h.orchestration.setPersonaPaused('pp', 'p1', true)
  await r.scheduler.cycle()
  expect(r.drives).toEqual([])
})

it('without a connected AI the team waits, says so once, and runs when it connects', async () => {
  const r = rig(host())
  customRoutine(r)
  r.engine.ready = false
  r.advance(2 * 3_600_000)
  for (let i = 0; i < 3; i += 1) expect((await r.scheduler.cycle()).projects[0]?.state).toBe('no_engine')
  expect(r.posts).toEqual([])
  expect(audits(r, 'sched:no_engine')).toHaveLength(1)
  expect(r.routines.listRuns('r1')).toEqual([])
  r.engine.ready = true
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
  expect(audits(r, 'sched:engine_ready')).toHaveLength(1)
})

it('a run leased by a process that died is released and tried again', async () => {
  const r = rig(host())
  customRoutine(r)
  r.advance(2 * 3_600_000)
  r.routines.schedule({ id: 'r1@old', routineId: 'r1', scheduledFor: '2026-11-03T09:00:00.000Z' })
  expect(r.routines.claimDue('pp', '2026-11-03T09:30:00.000Z')).toHaveLength(1)
  r.advance(3_600_000)
  await r.scheduler.cycle()
  expect(r.posts).toHaveLength(1)
  expect(r.routines.getRun('r1@old')?.status).toBe('done')
})

it('a failed run is retried with backoff and then handed to the person', async () => {
  const r = rig(host())
  const rt = r.h.orchestration.runtime('pp')
  const failedAt = '2026-11-03T08:00:00.000Z'
  rt.repo.tickets.save(ticket({
    assignments: [{ id: 'a1', state: 'running', createdAt: '2026-11-03T07:00:00.000Z', report: { state: 'failed', summary: 'O motor caiu.', at: failedAt } }],
  }))
  const retries: string[] = []
  const engine = rt.engine
  const original = engine.retryTicket.bind(engine)
  engine.retryTicket = (id: string) => { retries.push(id); return original(id) }
  r.advance(60_000)
  await r.scheduler.cycle()
  expect(retries).toEqual([]) // backoff of 2 min has not passed
  r.advance(2 * 60_000)
  const report = await r.scheduler.cycle()
  expect(report.projects[0]?.retried).toEqual(['t1'])
  expect(retries).toEqual(['t1'])
  expect(audits(r, 'sched:retry')[0]).toMatch(/Tentando “Implementar faixa Agora” de novo \(1 de 3\)/)
})

it('timers: start arms once, the cycle re-arms itself, dispose stops it', async () => {
  const handlers = new Map<number, { run: () => void; ms: number }>()
  let seq = 0
  const timers: SchedulerTimers = {
    set: (run, ms) => { seq += 1; handlers.set(seq, { run, ms }); return seq },
    clear: (handle) => { handlers.delete(handle) },
  }
  const r = rig(host(), { cycleMs: 30_000, timers })
  expect(r.scheduler.status('pp').running).toBe(false)
  r.scheduler.start()
  r.scheduler.start()
  expect([...handlers.values()].map(item => item.ms)).toEqual([5_000])
  expect(r.scheduler.status('pp')).toMatchObject({ running: true, cycleMs: 30_000 })
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  const first = [...handlers.values()][0]
  handlers.clear()
  first?.run()
  await r.scheduler.whenIdle()
  await new Promise(resolve => setTimeout(resolve, 20))
  expect(r.drives).toEqual(['t1'])
  expect([...handlers.values()].map(item => item.ms)).toEqual([30_000])
  expect(r.scheduler.status('pp').nextCycleAt).not.toBe('')
  r.scheduler.dispose()
  expect(handlers.size).toBe(0)
  expect(r.scheduler.status('pp').running).toBe(false)
  expect((await r.scheduler.cycle()).skipped).toBe('disposed')
})

it('cycleMs 0 never arms a timer, and a cycle never starts inside another one', async () => {
  const r = rig(host())
  r.scheduler.start()
  expect(r.scheduler.status('pp').running).toBe(false)
  const first = await r.scheduler.cycle()
  expect(first.skipped).toBeUndefined()
  // a cycle that is running (a drive failing inside one calls back into the scheduler) is never re-entered
  const reentrant = new ProactivityScheduler({ ...r.scheduler.deps, goalsOf: () => { void inner.cycle().then((report) => { nested = report.skipped }); return [] } }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  const inner = reentrant
  let nested: string | undefined = 'untouched'
  await reentrant.cycle()
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(nested).toBe('busy')
})

it('a failing model port is recorded and does not break the cycle', async () => {
  const r = rig(host())
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  const failing = new ProactivityScheduler({ ...r.scheduler.deps, driveTicket: () => Promise.reject(new Error('runner sumiu')) }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  const report = await failing.cycle()
  await failing.whenIdle()
  expect(report.projects[0]?.assigned).toEqual(['t1'])
  expect(audits(r, 'sched:error')[0]).toMatch(/runner sumiu/)
  expect(failing.lastErrors[0]).toMatch(/runner sumiu/)
})

it('status gives the UI what it needs', async () => {
  const r = rig(host())
  r.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  await r.scheduler.cycle()
  const status = r.scheduler.status('pp')
  expect(status).toMatchObject({ projectId: 'pp', state: 'working', openGoals: 1, queued: 1, lastCycleAt: new Date(START).toISOString() })
  expect(status.lastActions.map(item => item.kind)).toContain('sched:assigned')
})

it('a routine message the pipeline refuses goes back for the next cycle, says why, and gives up after three', async () => {
  const r = rig(host())
  customRoutine(r)
  r.post.result = { ok: false, reason: 'janela de silêncio ou orçamento esgotado' }
  r.advance(2 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.routines.getRun('r1@2026-11-03T09:00:00.000Z')?.status).toBe('pending')
  expect(audits(r, 'sched:not_delivered')[0]).toMatch(/Tento de novo no próximo ciclo/)
  r.post.result = { ok: true, ticketId: 'tk' }
  await r.scheduler.cycle()
  expect(r.routines.getRun('r1@2026-11-03T09:00:00.000Z')?.status).toBe('done')
  r.advance(24 * 3_600_000)
  r.post.result = { ok: false, reason: 'duplicado exato ou quase exato na janela' }
  for (let i = 0; i < 4; i += 1) await r.scheduler.cycle()
  const day2 = r.routines.listRuns('r1')[0]
  expect(day2?.status).toBe('failed')
  expect(audits(r, 'sched:not_delivered').some(line => /Parei de tentar/.test(line))).toBe(true)
})

it('an initiative that cannot start as a task still leaves its proposal and says why', async () => {
  const r = rig(host())
  r.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  r.proactivity.setAutonomy({ projectId: 'pp', personaId: 'p2', mode: 'act', proposalBudget: 3, tokenBudget: 1000, executionBudget: 8, silenceStart: '', silenceEnd: '' })
  r.post.result = { ok: false, reason: 'pedido fora de escopo — sem modelo' }
  r.advance(25 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.proactivity.repos.firesSince('pp', '1970-01-01T00:00:00.000Z').some(fire => fire.personaId === 'p2')).toBe(true)
  expect(audits(r, 'sched:not_delivered').join('|')).toMatch(/A iniciativa de Iris não virou tarefa/)
})

it('"agir dentro de limites" turns the daily initiative into a task, only with an open goal', async () => {
  const r = rig(host())
  r.proactivity.setAutonomy({ projectId: 'pp', personaId: 'p2', mode: 'act', proposalBudget: 3, tokenBudget: 1000, executionBudget: 8, silenceStart: '', silenceEnd: '' })
  r.advance(25 * 3_600_000)
  await r.scheduler.cycle()
  expect(r.posts.filter(post => post.kind === 'initiative')).toEqual([]) // no goal ⇒ proposal only, zero model
  r.advance(24 * 3_600_000)
  r.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  await r.scheduler.cycle()
  const initiative = r.posts.filter(post => post.kind === 'initiative')
  expect(initiative).toHaveLength(1)
  expect(initiative[0]).toMatchObject({ personaId: 'p2', actorId: 'team:initiative' })
  expect(initiative[0]?.body).toMatch(/^@Iris Faça o próximo passo do objetivo “Site no ar”/)
})

it('while a task runs the scheduler re-measures its draft; a failing measurement is not fatal', async () => {
  const r = rig(host())
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket())
  const measured: string[] = []
  const scheduler = new ProactivityScheduler({
    ...r.scheduler.deps,
    refreshDraft: (_projectId, ticketId) => { measured.push(ticketId); return Promise.resolve() },
  }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  await scheduler.cycle()
  await scheduler.whenIdle()
  expect(measured).toEqual(['t1'])
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket({ ended: { at: '2026-11-03T08:00:00.000Z', by: 'executor', outcome: 'completed' } }))
  await scheduler.cycle()
  expect(measured).toEqual(['t1']) // an ended ticket has no draft to follow
  r.h.orchestration.runtime('pp').repo.tickets.save(ticket({ id: 't2' }))
  const failing = new ProactivityScheduler({ ...r.scheduler.deps, refreshDraft: () => Promise.reject(new Error('git sumiu')) }, { nowMs: () => r.clock.ms, cycleMs: 0 })
  await failing.cycle()
  await failing.whenIdle()
  expect(failing.lastErrors.some(line => /git sumiu/.test(line))).toBe(true)
})

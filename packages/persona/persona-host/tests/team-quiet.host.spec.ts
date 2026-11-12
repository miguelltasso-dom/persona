/**
 * HONEST-1 (Atlas 11/11), block 2: the "Janela de silêncio" is the SILENCE OF THE WHOLE TEAM, not a note. Inside the window nothing starts by
 * itself — no initiative, no routine, no plan, no proposal card, no morning card — while a DIRECT request of the person is answered as always.
 * What was held waits (it is not lost) and goes when the window ends. The window is read in the person's LOCAL time through the same silence
 * arithmetic the Coordenação's silence uses, and its book says how many things it held ("Segurou 3 iniciativas esta semana").
 */
import { ticketGoal, type Ticket } from '@deepseek-ai/dsh-persona-engine'
import { ProactivityRepos, RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { ProactivityHost } from '../src/proactivity.ts'
import { createProactivityScheduler, postTeamRequest } from '../src/proactivity-wire.ts'
import { TeamStateBook } from '../src/team-state.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const DAY = 86_400_000
const T0 = Date.parse('2026-11-04T12:00:00.000Z')
const HOUR = 3_600_000
/** 2026-11-05 14:00Z: with a zero offset it is 14:00 on the person's clock. */
const AT_14 = T0 + 26 * HOUR

function setup(): PersonaHost {
  const h = openJourney(new Date(T0).toISOString())
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
    { id: 'bento', name: 'Bento', title: 'Engenharia' },
  ])
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
  h.timezoneOffsetMinutes = () => 0 // the person's clock is UTC here; the local-time spec below sets its own
  return h
}

/** A Ticket of Nina waiting on a question for 2 days: what her daily initiative proposes to unblock. */
function asking(h: PersonaHost): void {
  const at = new Date(T0 - 2 * DAY).toISOString()
  const ticket: Ticket = {
    id: 't1', title: 'Cardápio de almoço', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{ id: 't1-a1', state: 'running', createdAt: at, startedAt: at, report: { state: 'waiting', summary: 'Qual preço cobro pelo combo?', at } }],
    inputs: [], undelivered: [],
    attention: { id: 'att-t1', question: 'Qual preço cobro pelo combo?' },
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-t1', triggerIds: ['m-t1'] },
    execution: { name: 'Nina', directory: '.', assignment: 'Cardápio de almoço' },
  }
  h.orchestration.runtime('pp').repo.tickets.save(ticket)
}

function liveScheduler(h: PersonaHost) {
  const clock = { ms: T0 }
  const nowIso = (): string => new Date(clock.ms).toISOString()
  h.orchestration.now = nowIso
  const routines = new RoutineRepos(h.store, nowIso)
  const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
  proactivity.houseRules = h.screens.houseRules
  proactivity.ensureAllInitiativeRoutines('pp')
  const scheduler = createProactivityScheduler({
    product: h.product, events: h.events, routines, proactivity, screens: h.screens.screens, orchestration: h.orchestration,
    boards: h.boards, teamState: new TeamStateBook(h.screens.screens, routines, nowIso), governance: h.governance,
    draftFiles: h.draftFiles, workingControl: h.workingControl, taskProposals: h.taskProposals, morningBrief: h.morningBrief,
    houseRules: h.screens.houseRules,
  }, { nowMs: () => clock.ms, cycleMs: 0 })
  return { clock, scheduler, proactivity, routines }
}

const geral = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const proposalCards = (h: PersonaHost) => geral(h).filter(row => row.taskProposal !== undefined)
const window = (h: PersonaHost, start = '13:00', end = '15:00') => h.putQuietWindow({ ...SCOPE, id: 'q1', label: 'Tarde', start, end })
const book = (h: PersonaHost) => h.listQuietWindows(SCOPE)[0]!.applied!

it('inside the window the team starts NOTHING by itself: no initiative, no proposal card, no model; the book says what it held', async () => {
  const h = setup()
  asking(h)
  window(h)
  const { clock, scheduler } = liveScheduler(h)
  clock.ms = AT_14
  const report = await scheduler.cycle()
  await scheduler.whenIdle()
  expect(proposalCards(h)).toHaveLength(0)
  expect(report.projects[0]).toMatchObject({ routinesRun: 0, modelStarts: 0 })
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1) // only the one the person already had
  const first = book(h)
  expect(first.total).toBeGreaterThanOrEqual(3) // one initiative per persona was due and held
  expect(first.lastWhat).toMatch(/iniciativa de /u)
  await scheduler.cycle() // the same window looks at the same things again: counted once
  expect(book(h).total).toBe(first.total)
})

it('what was held is not lost: when the window ends the initiative runs and the card appears, once', async () => {
  const h = setup()
  asking(h)
  window(h)
  const { clock, scheduler } = liveScheduler(h)
  clock.ms = AT_14
  await scheduler.cycle()
  expect(proposalCards(h)).toHaveLength(0)
  clock.ms = T0 + 27 * HOUR // 15:00 sharp: the end is exclusive
  await scheduler.cycle()
  await scheduler.whenIdle()
  expect(proposalCards(h)).toHaveLength(1)
  await scheduler.cycle()
  await scheduler.whenIdle()
  expect(proposalCards(h)).toHaveLength(1)
})

it('a custom routine due inside the window waits and runs after it, exactly once', async () => {
  const h = setup()
  window(h)
  const { clock, scheduler, routines } = liveScheduler(h)
  routines.create({ id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Resumo do dia', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
  h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'nina', prompt: 'Resuma o que a equipe entregou ontem.' })
  clock.ms = AT_14
  await scheduler.cycle()
  await scheduler.whenIdle()
  await h.orchestration.flush('pp')
  expect(h.events.listProject('pp').some(event => event.actorId === 'routine:r1')).toBe(false)
  expect(h.listQuietWindows(SCOPE)[0]!.applied!.lastWhat).toBeDefined()
  clock.ms = T0 + 27 * HOUR
  await scheduler.cycle()
  await scheduler.whenIdle()
  await h.orchestration.flush('pp')
  expect(h.events.listProject('pp').filter(event => event.actorId === 'routine:r1')).toHaveLength(1)
  expect(h.orchestration.runtime('pp').repo.tickets.list().some(ticket => ticket.execution?.name === 'Nina')).toBe(true)
})

it('an open goal does not make the Coordenação plan inside the window; it plans after', async () => {
  const h = setup()
  window(h)
  h.boards.goals.save(ticketGoal('sprint-1', 'pp', 'Site no ar'))
  const { clock, scheduler } = liveScheduler(h)
  clock.ms = AT_14
  const held = await scheduler.cycle()
  await scheduler.whenIdle()
  expect(held.projects[0]?.planned).toEqual([])
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(0)
  clock.ms = T0 + 27 * HOUR
  const after = await scheduler.cycle()
  await scheduler.whenIdle()
  expect(after.projects[0]?.planned).toEqual(['goal-ticket-sprint-1'])
})

it('an outside event (PR, recurring error) does not start an initiative inside the window', () => {
  const h = setup()
  window(h)
  const { clock, proactivity } = liveScheduler(h)
  clock.ms = AT_14
  expect(proactivity.fireEvent('pp', 'PR aberta', 'pr-1')).toEqual([])
  expect(book(h).total).toBeGreaterThanOrEqual(1)
  clock.ms = T0 + 8 * HOUR // 20:00: outside the window
  expect(proactivity.fireEvent('pp', 'PR aberta', 'pr-2').length).toBeGreaterThan(0)
})

it('the morning card from the scheduler tick is held inside the window and posted after it', async () => {
  const h = setup()
  h.teamworkEnabled = true
  const stamp = '2026-11-05T08:00:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save({
    id: 'arte', title: 'Arte da campanha', decisionId: 'd-arte',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a-arte', state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: '2026-11-05T09:20:00.000Z', origin: { triggerId: 't-arte', triggerIds: ['t-arte'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Arte da campanha' },
  })
  h.putQuietWindow({ ...SCOPE, id: 'q1', label: 'Manhã', start: '09:00', end: '10:00' })
  const { clock, scheduler } = liveScheduler(h)
  const cards = () => geral(h).filter(row => row.dailyBrief !== undefined)
  clock.ms = Date.parse('2026-11-05T09:30:00.000Z')
  await scheduler.cycle()
  expect(cards()).toHaveLength(0)
  clock.ms = Date.parse('2026-11-05T10:05:00.000Z')
  await scheduler.cycle()
  expect(cards()).toHaveLength(1)
})

it('a DIRECT request of the person is answered inside the window, never held', async () => {
  const h = setup()
  window(h)
  const { clock } = liveScheduler(h)
  clock.ms = AT_14
  h.postMessage({ id: 'm1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: '@Nina faça o relatório do dia', actorId: 'ana', subjectId: '', occurredAt: new Date(AT_14).toISOString() })
  await h.orchestration.flush('pp')
  const lines = geral(h).map(row => row.body)
  expect(lines.some(line => /silêncio/iu.test(line))).toBe(false)
  expect(h.orchestration.runtime('pp').repo.tickets.list().some(ticket => ticket.execution?.name === 'Nina')).toBe(true)
})

it('the last wall: a request the TEAM posts (initiative or plan) is refused inside the window; a person-accepted proposal is not', () => {
  const h = setup()
  window(h)
  const { clock } = liveScheduler(h)
  clock.ms = AT_14
  const host = { product: h.product, events: h.events, orchestration: h.orchestration, houseRules: h.screens.houseRules }
  const base = { workspaceId: 'ws', projectId: 'pp', actorId: 'team:initiative', personaId: 'nina', body: '@Nina Faça o próximo passo.' }
  const refused = postTeamRequest(host, { ...base, id: 'init-1', kind: 'initiative' })
  expect(refused).toMatchObject({ ok: false })
  expect(h.events.has('init-1')).toBe(false)
  expect(postTeamRequest(host, { ...base, id: 'plan-1', actorId: 'team:plan', kind: 'plan' })).toMatchObject({ ok: false })
  postTeamRequest(host, { ...base, id: 'prop-1', actorId: 'ana', kind: 'proposal' })
  expect(h.events.has('prop-1')).toBe(true) // the person said yes to a proposal: that is a request of the person
})

it('the window is read in the person\'s LOCAL time: overnight windows wrap, the end is exclusive, the end of THIS occurrence is exact', () => {
  const h = setup()
  h.timezoneOffsetMinutes = () => -180 // São Paulo
  h.putQuietWindow({ ...SCOPE, id: 'q1', label: 'Noite', start: '20:00', end: '08:00' })
  const rules = h.screens.houseRules
  expect(rules.quietNow('pp', '2026-11-05T03:00:00.000Z')).toMatchObject({ label: 'Noite', untilMs: Date.parse('2026-11-05T11:00:00.000Z') }) // 00:00 local
  expect(rules.quietNow('pp', '2026-11-05T22:00:00.000Z')).toBeUndefined() // 19:00 local
  expect(rules.quietNow('pp', '2026-11-05T23:30:00.000Z')).toMatchObject({ untilMs: Date.parse('2026-11-06T11:00:00.000Z') }) // 20:30 local, ends tomorrow
  expect(rules.quietNow('pp', '2026-11-05T11:00:00.000Z')).toBeUndefined() // 08:00 local: the end is exclusive
})

it('with no window saved the team behaves exactly as before (the book stays empty)', async () => {
  const h = setup()
  asking(h)
  const { clock, scheduler } = liveScheduler(h)
  clock.ms = AT_14
  await scheduler.cycle()
  await scheduler.whenIdle()
  expect(proposalCards(h)).toHaveLength(1)
})

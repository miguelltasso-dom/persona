/**
 * Colheita S1 P1-12: (1) a quiet window ("silêncio") is a clock on the PERSON's wall, not UTC: 22:00–08:00 in Brasília must be silent at 22:30 local
 * (01:30Z), not at 19:30 local (22:30Z); (2) the scheduler runs on the host's one clock (`orchestration.now`), not on `Date.now()`; (3) a routine held
 * by the 95% window reserve is queued ONCE, not once per 30 s cycle.
 */
import { ProactivityRepos, RoutineRepos } from '@deepseek-ai/dsh-persona-store'
import { describe, expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { inSilence, ProactivityHost, silenceUntilOf } from '../src/proactivity.ts'
import { createProactivityScheduler } from '../src/proactivity-wire.ts'
import { TeamStateBook } from '../src/team-state.ts'
import { WindowResumeQueue } from '../src/window-reserve.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const BRASILIA = -180
const iso = (value: string): string => `${value}.000Z`

describe('inSilence / silenceUntilOf read the person\'s wall clock', () => {
  it('22:00–08:00: 22:30Z in Brasília is 19:30 (NOT silent); 01:30Z is 22:30 (silent)', () => {
    expect(inSilence(iso('2026-11-12T22:30:00'), '22:00', '08:00', BRASILIA)).toBe(false)
    expect(inSilence(iso('2026-11-13T01:30:00'), '22:00', '08:00', BRASILIA)).toBe(true)
    expect(inSilence(iso('2026-11-13T10:59:00'), '22:00', '08:00', BRASILIA)).toBe(true) // 07:59 local
    expect(inSilence(iso('2026-11-13T11:00:00'), '22:00', '08:00', BRASILIA)).toBe(false) // 08:00 local: the end is exclusive
  })
  it('a same-day window moves too: 13:00–15:00 local is 16:00Z–18:00Z', () => {
    expect(inSilence(iso('2026-11-12T14:00:00'), '13:00', '15:00', BRASILIA)).toBe(false)
    expect(inSilence(iso('2026-11-12T16:30:00'), '13:00', '15:00', BRASILIA)).toBe(true)
  })
  it('the end of the window is a real instant: 22:30 local → 08:00 local the next day = 11:00Z', () => {
    expect(silenceUntilOf(iso('2026-11-13T01:30:00'), '22:00', '08:00', BRASILIA)).toBe(Date.parse('2026-11-13T11:00:00.000Z'))
    expect(silenceUntilOf(iso('2026-11-13T06:00:00'), '22:00', '08:00', BRASILIA)).toBe(Date.parse('2026-11-13T11:00:00.000Z')) // 03:00 local: today's 08:00
    expect(silenceUntilOf(iso('2026-11-12T22:30:00'), '22:00', '08:00', BRASILIA)).toBe(0) // not silent
  })
  it('no offset (a machine on UTC, or an old caller) behaves as before', () => {
    expect(inSilence(iso('2026-11-12T22:30:00'), '22:00', '08:00')).toBe(true)
    expect(silenceUntilOf(iso('2026-11-12T22:30:00'), '22:00', '08:00')).toBe(Date.parse('2026-11-13T08:00:00.000Z'))
  })
})

function setup(): PersonaHost {
  const h = openJourney(iso('2026-11-12T12:00:00'))
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
  ])
  h.sessionMemberId = 'ana'
  h.store.db.exec('DELETE FROM routine_run')
  h.store.db.exec('DELETE FROM routine')
  return h
}

const clock = (h: PersonaHost, at: string): void => { h.orchestration.now = () => at }

describe('the host\'s own silence reads the machine\'s offset (the same one the quiet window and the morning card use)', () => {
  it('a persona\'s silence 22:00–08:00: an initiative fires at 19:30 local and waits at 22:30 local', () => {
    const h = setup()
    h.timezoneOffsetMinutes = () => BRASILIA
    h.setAutonomy({ ...SCOPE, personaId: 'nina', mode: 'propose', proposalBudget: 3, tokenBudget: 1_000, executionBudget: 8, silenceStart: '22:00', silenceEnd: '08:00' })
    clock(h, iso('2026-11-12T22:30:00')) // 19:30 in Brasília
    expect(h.proactivity.restFacts('pp', 'nina').quiet).toBeUndefined()
    expect(h.proactivity.fire('pp', 'nina', 'routine', 'Revisar o projeto e propor o próximo passo')).toBe(true)
    clock(h, iso('2026-11-13T01:30:00')) // 22:30 in Brasília
    expect(h.proactivity.restFacts('pp', 'nina').quiet).toBe(true)
    expect(h.proactivity.fire('pp', 'nina', 'routine', 'Mais uma revisão do projeto')).toBe(false)
  })

  it('a routine\'s own quiet window (the store) is read on the same wall clock', () => {
    const h = setup()
    const at = { ms: Date.parse('2026-11-12T22:30:00.000Z') }
    const now = (): string => new Date(at.ms).toISOString()
    const routines = new RoutineRepos(h.store, now, () => BRASILIA)
    routines.create({ id: 'q1', workspaceId: 'ws', projectId: 'pp', name: 'Pedidos', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once', silenceStart: '22:00', silenceEnd: '08:00' })
    routines.schedule({ id: 'q1@a', routineId: 'q1', scheduledFor: '2026-11-12T22:00:00.000Z' })
    expect(routines.claimDue('pp', '2026-11-12T23:00:00.000Z').map(run => run.id)).toEqual(['q1@a']) // 19:30 local: not silent
    at.ms = Date.parse('2026-11-13T01:30:00.000Z') // 22:30 local: silent
    routines.schedule({ id: 'q1@b', routineId: 'q1', scheduledFor: '2026-11-13T01:00:00.000Z' })
    expect(routines.claimDue('pp', '2026-11-13T02:00:00.000Z')).toEqual([])
  })
})

describe('the scheduler runs on the host\'s clock', () => {
  it('a host whose clock is injected (tests, a replayed day) materializes and runs its routines on THAT time, not on Date.now()', async () => {
    const h = setup()
    clock(h, iso('2030-01-01T08:00:00'))
    h.routines.create({ id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Resumo', rrule: 'FREQ=DAILY;BYHOUR=9', timeZone: 'UTC', catchUp: 'run_once' })
    h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'nina', prompt: 'Resuma o dia.' })
    clock(h, iso('2030-01-02T10:00:00'))
    await h.proactivityScheduler.cycle()
    await h.proactivityScheduler.whenIdle()
    expect(h.routines.listRuns('r1').length).toBeGreaterThan(0)
  })
})

describe('a routine held by the 95% window reserve is queued once', () => {
  function rig(h: PersonaHost) {
    const state = { ms: Date.parse('2026-11-12T08:00:00.000Z') }
    const nowIso = (): string => new Date(state.ms).toISOString()
    h.orchestration.now = nowIso
    const routines = new RoutineRepos(h.store, nowIso)
    const proactivity = new ProactivityHost(h.product, routines, new ProactivityRepos(h.store, nowIso), h.orchestration, nowIso)
    proactivity.houseRules = h.screens.houseRules
    const scheduler = createProactivityScheduler({
      product: h.product, events: h.events, routines, proactivity, screens: h.screens.screens, orchestration: h.orchestration,
      boards: h.boards, teamState: new TeamStateBook(h.screens.screens, routines, nowIso), governance: h.governance,
      draftFiles: h.draftFiles, workingControl: h.workingControl, taskProposals: h.taskProposals, morningBrief: h.morningBrief,
      houseRules: h.screens.houseRules,
    }, { nowMs: () => state.ms, cycleMs: 0 })
    return { state, routines, scheduler }
  }

  it('three 30 s cycles inside the reserve leave ONE request in the window queue, and the window renewing runs ONE turn', async () => {
    const h = setup()
    const { state, routines, scheduler } = rig(h)
    state.ms = Date.parse('2026-11-11T08:00:00.000Z') // created yesterday: today's 07:00 is already due
    routines.create({ id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Resumo', rrule: 'FREQ=DAILY;BYHOUR=7', timeZone: 'UTC', catchUp: 'run_once' })
    h.screens.screens.put('pp', 'routine_spec', 'r1', { personaId: 'nina', prompt: 'Resuma o dia.' })
    state.ms = Date.parse('2026-11-12T08:00:00.000Z')
    const keep = h.orchestration.windowReserveOf
    h.orchestration.windowReserveOf = () => ({ state: 'reserve', provider: 'claude', windowId: '5h', usedPercent: 96 })
    for (let cycle = 0; cycle < 3; cycle += 1) {
      await scheduler.cycle()
      await scheduler.whenIdle()
      state.ms += 30_000
    }
    const sent = h.events.listProject('pp').filter(event => event.actorId === 'routine:r1')
    expect(sent).toHaveLength(1)
    const rows = new WindowResumeQueue(h.screens.screens).list('pp')
    expect(rows.flatMap(row => row.eventIds)).toHaveLength(1)
    expect(routines.listRuns('r1').every(run => run.status === 'done')).toBe(true) // settled: it will go when the window renews, not retried every cycle
    h.orchestration.windowReserveOf = keep
    h.orchestration.releaseWindowQueue('pp')
    await h.orchestration.flush('pp')
    expect(h.orchestration.runtime('pp').repo.tickets.list().filter(ticket => ticket.execution?.name === 'Nina')).toHaveLength(1)
  })
})

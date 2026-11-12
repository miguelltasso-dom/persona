/**
 * Carbon P1-07, part 3 (colheita-s1-fix), the two halves that do not touch the routing pipeline:
 *  - `RoutineEventIntake` dropped every event above 6 an hour. For a source that is READ WITH A CURSOR (Telegram: the offset moves past an update the moment it is read) that is a silent
 *    loss for good. It is postponed now: the run waits for the hour to have room. (A mailbox keeps unread mail unread and takes it again: that source keeps the old rule, and its test.)
 *  - deleting a routine left the text of the events that had not run yet (`routine_event` documents) in the screen store for ever.
 * (Open, with its design in colheita-s1-respostas.md: the external text still enters the body the pipeline judges, and a run that fails for good keeps its event document.)
 */
import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import type { Routine, RoutineRun, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { describe, expect } from 'vitest'
import { EVENT_RUNS_PER_HOUR, RoutineEventIntake } from '../src/routine-event-intake.ts'
import { EVENT_DOC_KIND, EVENT_RRULE, eventRunIdOf } from '../src/routine-events.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

const NOW = '2026-11-12T10:00:00.000Z'
const HOUR = 3_600_000

function rig(source: string) {
  const runs = new Map<string, RoutineRun[]>()
  const docs = new Map<string, unknown>()
  const audits: string[] = []
  const clock = { iso: NOW }
  const routine: Routine = {
    id: 'r1', workspaceId: 'ws', projectId: 'pp', name: 'Rotina r1', rrule: EVENT_RRULE, timeZone: 'UTC', catchUp: 'run_all', paused: false,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  }
  const intake = new RoutineEventIntake({
    routines: {
      list: () => [routine],
      listRuns: id => runs.get(id) ?? [],
      schedule: (input) => {
        const run: RoutineRun = { id: input.id, projectId: 'pp', routineId: input.routineId, scheduledFor: input.scheduledFor, status: 'pending', attempt: 0 }
        runs.set(input.routineId, [run, ...(runs.get(input.routineId) ?? [])])
        return run
      },
    },
    screens: {
      get: (_project: string, kind: string, id: string) => (kind === 'routine_spec' ? { trigger: { kind: 'event', source, filter: {} } } : docs.get(`${kind}:${id}`)),
      put: (_project: string, kind: string, id: string, body: unknown) => { docs.set(`${kind}:${id}`, body) },
    } as unknown as ScreenRepos,
    now: () => clock.iso,
    audit: row => audits.push(row.detail),
  })
  return { intake, runs, docs, audits, clock }
}

const telegram = (id: string): Trigger => ({
  id: `tg:${id}`, source: 'telegram', threads: [{ source: 'telegram', id: 'chat1' }], actor: { source: 'telegram', id: 'cliente' }, human: true, addressed: 'direct',
  at: NOW, text: `pedido ${id}`, channel: { source: 'telegram', thread: 'chat1', address: {} }, meta: {},
})

describe('a source read with a cursor loses nothing above the hourly limit: the run is postponed', () => {
  it(`Telegram: ${String(EVENT_RUNS_PER_HOUR + 4)} updates in one pass start ${String(EVENT_RUNS_PER_HOUR)} now and the other 4 WAIT (a run each, with its text), none is lost`, () => {
    const r = rig('telegram')
    const batch = Array.from({ length: EVENT_RUNS_PER_HOUR + 4 }, (_, n) => telegram(`m${String(n)}`))
    const got = r.intake.take('pp', batch)
    expect(got.rest).toEqual([])
    expect(got.left).toBe(0) // before: 4 were "left out" and gone for good (the cursor already moved past them)
    const all = r.runs.get('r1') ?? []
    expect(all).toHaveLength(EVENT_RUNS_PER_HOUR + 4)
    const now = Date.parse(NOW)
    const waiting = all.filter(run => Date.parse(run.scheduledFor) > now + 1_000) // the runs that start now are staggered by a few ms
    expect(waiting).toHaveLength(4)
    expect(Math.min(...waiting.map(run => Date.parse(run.scheduledFor)))).toBeGreaterThanOrEqual(now + HOUR) // the hour has room only after the oldest runs age out
    for (const trigger of batch) expect(r.docs.has(`${EVENT_DOC_KIND}:${eventRunIdOf('r1', trigger.id)}`), trigger.id).toBe(true) // every event keeps its text
    expect(r.audits.some(line => line.includes('adiad'))).toBe(true) // and the person is told they wait, not that they were dropped
  })

  it('a flood is bounded: past what can wait the rest is dropped, SAID so, never silently', () => {
    const r = rig('telegram')
    const flood = Array.from({ length: EVENT_RUNS_PER_HOUR + 80 }, (_, n) => telegram(`f${String(n)}`))
    const got = r.intake.take('pp', flood)
    expect(got.left).toBeGreaterThan(0)
    expect((r.runs.get('r1') ?? []).length).toBeLessThan(flood.length)
    expect(r.audits.some(line => line.includes('perdi') || line.includes('não cabem'))).toBe(true)
  })

  it('a source that is NOT read with a cursor keeps the old rule (unread mail is taken again after the hour): nothing is postponed', () => {
    const r = rig('email')
    const mail = (n: number): Trigger => ({
      id: `mail:${String(n)}`, source: 'email', threads: [{ source: 'email', id: 'Pedido' }], actor: { source: 'email', id: 'ana@cliente.com.br' }, human: true, addressed: 'direct',
      at: NOW, text: 'oi', viaEmail: true, channel: { source: 'email', thread: 'Pedido', address: { from: 'ana@cliente.com.br', to: 'vendas@padaria.com.br', message: String(n) } }, meta: { subject: 'Pedido' },
    })
    const got = r.intake.take('pp', Array.from({ length: EVENT_RUNS_PER_HOUR + 4 }, (_, n) => mail(n)))
    expect(got.started).toBe(EVENT_RUNS_PER_HOUR)
    expect(got.left).toBe(4)
    expect((r.runs.get('r1') ?? [])).toHaveLength(EVENT_RUNS_PER_HOUR)
  })
})

describe('deleting a routine takes the text of its waiting events with it', () => {
  it('the routine_event documents of its runs are gone (they held external text, and nothing would ever read them again)', () => {
    const h = openJourney()
    seedJourney(h, [{ id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true }, { id: 'nina', name: 'Nina', title: 'Atendimento' }])
    h.sessionMemberId = 'ana'
    h.createRoutine({
      ...SCOPE, id: 'r9', name: 'Diária', rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0', timeZone: 'UTC', catchUp: 'skip', silenceStart: '', silenceEnd: '',
      prompt: 'Faça a rotina.', ownerPersonaId: 'nina',
    } as never)
    const runId = eventRunIdOf('r9', 'tg:1')
    h.routines.schedule({ id: runId, routineId: 'r9', scheduledFor: new Date(Date.now() + HOUR).toISOString() })
    h.screens.screens.put('pp', EVENT_DOC_KIND, runId, { source: 'telegram', eventId: 'tg:1', text: 'DADO EXTERNO: dados do cliente' })
    expect(h.screens.screens.get('pp', EVENT_DOC_KIND, runId)).toBeDefined() // the control: it is there before
    h.deleteRoutine({ ...SCOPE, id: 'r9' })
    expect(h.screens.screens.get('pp', EVENT_DOC_KIND, runId), 'the text of a waiting event stayed in the store after its routine was deleted').toBeUndefined()
  })
})

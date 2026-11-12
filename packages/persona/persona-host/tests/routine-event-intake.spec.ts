import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import type { Routine, RoutineRun, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { describe, expect, it } from 'vitest'
import { EVENT_RUNS_PER_HOUR, RoutineEventIntake, SOURCE_PROVIDER } from '../src/routine-event-intake.ts'
import { EVENT_DOC_KIND, EVENT_RRULE, eventRunIdOf, triggerOfRoutine, type RoutineEventDoc } from '../src/routine-events.ts'

/** The intake on in-memory fakes: which triggers a routine takes, what it queues, what stays for the conversation. */
const NOW = '2026-11-12T10:00:00.000Z'

function rig(routines: Routine[], specs: Record<string, unknown>) {
  const runs = new Map<string, RoutineRun[]>()
  const docs = new Map<string, unknown>()
  const audits: string[] = []
  const clock = { iso: NOW }
  const intake = new RoutineEventIntake({
    routines: {
      list: () => routines,
      listRuns: id => runs.get(id) ?? [],
      schedule: (input) => {
        const run: RoutineRun = { id: input.id, projectId: 'pp', routineId: input.routineId, scheduledFor: input.scheduledFor, status: 'pending', attempt: 0 }
        runs.set(input.routineId, [run, ...(runs.get(input.routineId) ?? [])])
        return run
      },
    },
    screens: {
      get: (_project: string, kind: string, id: string) => (kind === 'routine_spec' ? specs[id] : docs.get(`${kind}:${id}`)),
      put: (_project: string, kind: string, id: string, body: unknown) => { docs.set(`${kind}:${id}`, body) },
    } as unknown as ScreenRepos,
    now: () => clock.iso,
    audit: row => audits.push(row.detail),
  })
  return { intake, runs, docs, audits, clock }
}

const routine = (id: string, over: Partial<Routine> = {}): Routine => ({
  id, workspaceId: 'ws', projectId: 'pp', name: `Rotina ${id}`, rrule: EVENT_RRULE, timeZone: 'UTC', catchUp: 'run_all', paused: false,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...over,
})

const mail = (id: string, text = 'Quero 2 bolos', from = 'ana@cliente.com.br'): Trigger => ({
  id: `mail:${id}`, source: 'email', threads: [{ source: 'email', id: 'Pedido' }], actor: { source: 'email', id: from }, human: true, addressed: 'direct',
  at: NOW, text, viaEmail: true, channel: { source: 'email', thread: 'Pedido', address: { from, to: 'vendas@padaria.com.br', message: id } }, meta: { subject: 'Pedido' },
})
const slack = (id: string): Trigger => ({
  id: `slack:${id}`, source: 'slack', threads: [{ source: 'slack', id: 'vendas' }], actor: { source: 'slack', id: 'bia' }, human: true, addressed: 'direct',
  at: NOW, text: 'chegou o pedido', channel: { source: 'slack', thread: 'vendas', address: {} }, meta: {},
})
const listens = (source: string, filter: Record<string, string[]> = {}) => ({ trigger: { kind: 'event', source, filter } })

describe('the routine that listens takes what it asked for and nothing else', () => {
  it('a match becomes ONE pending run with the event as fenced data; the engine does not also get it', () => {
    const r = rig([routine('r1')], { r1: listens('email', { from: ['cliente.com.br'] }) })
    const got = r.intake.take('pp', [mail('m1')])
    expect(got).toEqual({ rest: [], started: 1, left: 0 })
    const run = r.runs.get('r1')?.[0]
    expect(run).toMatchObject({ id: eventRunIdOf('r1', 'mail:m1'), status: 'pending', scheduledFor: NOW })
    const doc = r.docs.get(`${EVENT_DOC_KIND}:${eventRunIdOf('r1', 'mail:m1')}`) as RoutineEventDoc
    expect(doc.text).toContain('DADO EXTERNO')
    expect(doc.text).toContain('Quero 2 bolos')
    expect(doc.source).toBe('email')
  })
  it('an event the filter does not want is left for the conversation path and queues nothing (zero cost)', () => {
    const r = rig([routine('r1')], { r1: listens('email', { from: ['financeiro@'] }) })
    const mails = [mail('m1'), mail('m2')]
    const got = r.intake.take('pp', mails)
    expect(got.rest).toEqual(mails)
    expect(got).toMatchObject({ started: 0, left: 0 })
    expect(r.runs.size).toBe(0)
    expect(r.docs.size).toBe(0)
  })
  it('only the source the routine listens to: a Slack message does not start an e-mail routine', () => {
    const r = rig([routine('r1')], { r1: listens('email') })
    const got = r.intake.take('pp', [slack('1'), mail('m1')])
    expect(got.rest.map(item => item.id)).toEqual(['slack:1'])
    expect(got.started).toBe(1)
  })
  it('the same event never starts the same routine twice, however many polls bring it back', () => {
    const r = rig([routine('r1')], { r1: listens('email') })
    expect(r.intake.take('pp', [mail('m1')]).started).toBe(1)
    const again = r.intake.take('pp', [mail('m1')])
    expect(again).toEqual({ rest: [], started: 0, left: 1 })
    expect(r.runs.get('r1')).toHaveLength(1)
  })
  it('two routines that want the same event each start once', () => {
    const r = rig([routine('r1'), routine('r2')], { r1: listens('email'), r2: listens('email', { contains: ['bolo'] }) })
    expect(r.intake.take('pp', [mail('m1')]).started).toBe(2)
    expect(r.runs.get('r1')).toHaveLength(1)
    expect(r.runs.get('r2')).toHaveLength(1)
  })
  it('two events in the same instant are two runs (the unique key is time, so the second is nudged)', () => {
    const r = rig([routine('r1')], { r1: listens('email') })
    r.intake.take('pp', [mail('m1'), mail('m2')])
    const stamps = (r.runs.get('r1') ?? []).map(run => run.scheduledFor)
    expect(new Set(stamps).size).toBe(2)
  })
})

describe('what makes a routine a listener', () => {
  it('a paused routine does not listen: its events keep going to the conversation', () => {
    const r = rig([routine('r1', { paused: true })], { r1: listens('email') })
    const got = r.intake.take('pp', [mail('m1')])
    expect(got.rest).toHaveLength(1)
    expect(got.started).toBe(0)
  })
  it('a timed routine never listens, even if a stale trigger is left in its spec', () => {
    const r = rig([routine('r1', { rrule: 'FREQ=DAILY;BYHOUR=9' })], { r1: listens('email') })
    expect(r.intake.take('pp', [mail('m1')]).rest).toHaveLength(1)
    expect(triggerOfRoutine('FREQ=DAILY;BYHOUR=9', listens('email').trigger)).toEqual({ kind: 'schedule' })
  })
  it('an event routine whose spec lost its trigger (or holds garbage) listens to nothing', () => {
    const r = rig([routine('r1'), routine('r2')], { r2: { trigger: { kind: 'event', source: 'whatsapp' } } })
    expect(r.intake.take('pp', [mail('m1')]).rest).toHaveLength(1)
  })
  it('no listeners at all: the batch comes back as it was', () => {
    const r = rig([], {})
    const batch = [mail('m1'), slack('1')]
    expect(r.intake.take('pp', batch)).toEqual({ rest: batch, started: 0, left: 0 })
  })
})

describe('the hourly limit (a mailbox that spills must not become a model call per mail)', () => {
  it(`starts at most ${String(EVENT_RUNS_PER_HOUR)} runs an hour, says so once, and takes the rest again after the hour`, () => {
    const r = rig([routine('r1')], { r1: listens('email') })
    const batch = Array.from({ length: EVENT_RUNS_PER_HOUR + 4 }, (_, n) => mail(`m${String(n)}`))
    const got = r.intake.take('pp', batch)
    expect(got.started).toBe(EVENT_RUNS_PER_HOUR)
    expect(got.left).toBe(4)
    expect(got.rest).toEqual([])
    expect(r.audits).toHaveLength(4) // the audit id repeats inside the hour, so the store keeps one row
    expect(new Set(r.audits).size).toBe(1)
    r.clock.iso = '2026-11-12T11:05:00.000Z'
    const later = r.intake.take('pp', batch.slice(EVENT_RUNS_PER_HOUR))
    expect(later.started).toBe(4)
  })
})

describe('the Cofre slot of each source', () => {
  it('every source a routine can hear has its own credential slot', () => {
    expect(Object.keys(SOURCE_PROVIDER).sort()).toEqual(['calendar', 'discord', 'email', 'slack', 'telegram'])
    expect(new Set(Object.values(SOURCE_PROVIDER)).size).toBe(5)
  })
})

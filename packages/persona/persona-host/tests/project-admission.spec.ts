import type { WindowReserve } from '@deepseek-ai/dsh-persona-usage'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CEILING, ProjectAdmission, type PauseJournal, type ProjectCeiling, type ProjectPauseEvent, type TurnOrigin } from '../src/project-admission.ts'

/**
 * Marco DOGFOOD M2 (C4): the ceiling of a project, the pause at 95% as an observable event, the resume at the turn of the local day. The host's own time zone is injected (UTC-3, like the soak).
 */
const SP = -180
const at = (iso: string): { now: string } => ({ now: iso })

interface Rig {
  readonly admission: ProjectAdmission
  readonly clock: { now: string }
  readonly told: ProjectPauseEvent[]
  readonly tokens: Map<string, number>
  readonly slots: { free: boolean }
  readonly account: { reserve: WindowReserve | undefined }
  readonly ceilings: Map<string, ProjectCeiling>
  readonly journal: Map<string, ProjectPauseEvent>
}

function rig(start = '2026-11-12T20:00:00.000Z'): Rig { // 17:00 in São Paulo
  const clock = at(start)
  const counts = new Map<string, number>()
  const tokens = new Map<string, number>()
  const told: ProjectPauseEvent[] = []
  const slots = { free: true }
  const account: { reserve: WindowReserve | undefined } = { reserve: undefined }
  const ceilings = new Map<string, ProjectCeiling>()
  const stored = new Map<string, ProjectPauseEvent>()
  const journal: PauseJournal = {
    has: mark => stored.has(mark),
    put: (mark, event) => { stored.set(mark, event) },
    list: projectId => [...stored.values()].filter(event => event.projectId === projectId),
  }
  const admission = new ProjectAdmission({
    now: () => clock.now,
    offsetMinutes: () => SP,
    ceilingOf: projectId => ceilings.get(projectId) ?? DEFAULT_CEILING,
    turnsOf: (projectId, key) => counts.get(`${projectId}|${key}`) ?? 0,
    bump: (projectId, key) => { counts.set(`${projectId}|${key}`, (counts.get(`${projectId}|${key}`) ?? 0) + 1) },
    tokensOf: projectId => tokens.get(projectId) ?? 0,
    accountReserve: () => account.reserve,
    slotFree: () => slots.free,
    journal,
    onEvent: (event) => { told.push(event) },
  })
  return { admission, clock, told, tokens, slots, account, ceilings, journal: stored }
}

const ceiling = (turnsPerDay: number, tokensPerDay = 0): ProjectCeiling => ({ turnsPerDay, tokensPerDay, pausePct: 95 })
const spend = (r: Rig, project: string, origin: TurnOrigin, times: number): void => { for (let i = 0; i < times; i += 1) r.admission.admit(project, origin) }

describe('ProjectAdmission: the turn ceiling', () => {
  it('counts every admitted turn; the turn N+1 of the day does not run (nobody, not even the person); loadOf has no effect', () => {
    const r = rig()
    r.ceilings.set('loja', ceiling(3))
    expect(r.admission.admit('loja', 'person')).toMatchObject({ ok: true, load: { turns: { used: 1, max: 3 }, state: 'open' } })
    expect(r.admission.loadOf('loja').turns.used).toBe(1) // reading does not count
    expect(r.admission.loadOf('loja').turns.used).toBe(1)
    expect(r.admission.admit('loja', 'person').ok).toBe(true)
    expect(r.admission.admit('loja', 'person').ok).toBe(true)
    const fourth = r.admission.admit('loja', 'person')
    expect(fourth).toMatchObject({ ok: false, why: 'project-full', load: { state: 'full', turns: { used: 3, max: 3 } } })
    expect(r.admission.loadOf('loja').turns.used).toBe(3) // the refused turn was not counted
  })

  it('at 95% the team pauses and only the person keeps a turn; at 100% nothing runs', () => {
    const r = rig()
    r.ceilings.set('loja', ceiling(20))
    spend(r, 'loja', 'person', 19) // 95%
    expect(r.admission.loadOf('loja')).toMatchObject({ state: 'reserve', pct: 95 })
    for (const origin of ['quadro', 'routine', 'initiative', 'handoff'] as const) {
      expect(r.admission.admit('loja', origin), origin).toMatchObject({ ok: false, why: 'project-reserve' })
    }
    expect(r.admission.admit('loja', 'person').ok).toBe(true) // the 20th, the person's
    expect(r.admission.admit('loja', 'person')).toMatchObject({ ok: false, why: 'project-full' })
    expect(r.admission.admit('loja', 'quadro')).toMatchObject({ ok: false, why: 'project-full' })
  })

  it('the quota: tokens of the day from the ledger; at 95% the team pauses, the person keeps a turn', () => {
    const r = rig()
    r.ceilings.set('loja', ceiling(200, 100_000))
    r.tokens.set('loja', 94_999)
    expect(r.admission.admit('loja', 'quadro').ok).toBe(true)
    r.tokens.set('loja', 95_000)
    expect(r.admission.admit('loja', 'quadro')).toMatchObject({ ok: false, why: 'project-reserve', load: { state: 'reserve' } })
    expect(r.admission.admit('loja', 'person').ok).toBe(true)
    r.tokens.set('loja', 100_000)
    expect(r.admission.admit('loja', 'person')).toMatchObject({ ok: false, why: 'project-full' })
  })

  it('a ceiling of 0 tokens is no quota ceiling (the account window reserve still protects)', () => {
    const r = rig()
    r.ceilings.set('loja', ceiling(200, 0))
    r.tokens.set('loja', 999_999_999)
    expect(r.admission.loadOf('loja')).toMatchObject({ state: 'open', pct: 0 })
  })

  it('a project is not touched by the load of another', () => {
    const r = rig()
    r.ceilings.set('loja', ceiling(2))
    r.ceilings.set('obra', ceiling(2))
    spend(r, 'loja', 'person', 2)
    expect(r.admission.admit('loja', 'person').ok).toBe(false)
    expect(r.admission.admit('obra', 'quadro')).toMatchObject({ ok: true, load: { turns: { used: 1, max: 2 } } })
  })
})

describe('ProjectAdmission: one request counts once; the scheduler look; slots owned by the caller', () => {
  /** A rig whose counter remembers the keys, like the host's durable counter. */
  function keyed(): { readonly admission: ProjectAdmission; readonly clock: { now: string }; readonly told: ProjectPauseEvent[] } {
    const clock = at('2026-11-12T20:00:00.000Z')
    const counts = new Map<string, Set<string>>()
    const told: ProjectPauseEvent[] = []
    const stored = new Map<string, ProjectPauseEvent>()
    const admission = new ProjectAdmission({
      now: () => clock.now, offsetMinutes: () => SP, ceilingOf: () => ceiling(2),
      turnsOf: (projectId, key) => counts.get(`${projectId}|${key}`)?.size ?? 0,
      bump: (projectId, key, request) => {
        const mark = `${projectId}|${key}`
        const seen = counts.get(mark) ?? new Set<string>()
        seen.add(request ?? `anon-${String(seen.size)}`)
        counts.set(mark, seen)
      },
      counted: (projectId, key, request) => counts.get(`${projectId}|${key}`)?.has(request) ?? false,
      tokensOf: () => 0, accountReserve: () => undefined, slotFree: () => false,
      journal: { has: mark => stored.has(mark), put: (mark, event) => { stored.set(mark, event) }, list: projectId => [...stored.values()].filter(event => event.projectId === projectId) },
      onEvent: (event) => { told.push(event) },
    })
    return { admission, clock, told }
  }

  it('the same request asked twice counts ONCE, and is never refused after it was admitted (a request the host recovers)', () => {
    const { admission } = keyed()
    expect(admission.admit('loja', 'person', { key: 'm1', ignoreSlots: true }).ok).toBe(true)
    expect(admission.admit('loja', 'person', { key: 'm1', ignoreSlots: true }).ok).toBe(true)
    expect(admission.loadOf('loja').turns.used).toBe(1)
    expect(admission.admit('loja', 'person', { key: 'm2', ignoreSlots: true }).ok).toBe(true)
    expect(admission.loadOf('loja').state).toBe('full')
    expect(admission.admit('loja', 'person', { key: 'm3', ignoreSlots: true })).toMatchObject({ ok: false, why: 'project-full' })
    expect(admission.admit('loja', 'person', { key: 'm1', ignoreSlots: true }).ok, 'm1 was admitted before the ceiling').toBe(true)
    expect(admission.loadOf('loja').turns.used).toBe(2)
  })

  it('a full slot table is a refusal for a caller that does not queue (the loop) and none for one that does (the host)', () => {
    const { admission } = keyed()
    expect(admission.admit('loja', 'quadro')).toMatchObject({ ok: false, why: 'slots' })
    expect(admission.admit('loja', 'quadro', { ignoreSlots: true }).ok).toBe(true)
  })

  it('sweep tells the resume at the turn of the day without anybody asking for a turn, and counts nothing', () => {
    const { admission, clock, told } = keyed()
    admission.admit('loja', 'person', { key: 'a', ignoreSlots: true })
    admission.admit('loja', 'person', { key: 'b', ignoreSlots: true })
    admission.sweep('loja') // full, told once
    expect(told.map(event => event.kind)).toEqual(['full'])
    clock.now = '2026-11-13T03:00:00.000Z'
    expect(admission.sweep('loja')).toMatchObject({ state: 'open', turns: { used: 0 } })
    admission.sweep('loja')
    expect(told.map(event => event.kind)).toEqual(['full', 'resume'])
  })
})

describe('ProjectAdmission: the account window and the slots stay on top', () => {
  const reserve = (state: 'reserve' | 'exhausted'): WindowReserve => ({ state, provider: 'claude', windowId: '5h', usedPercent: state === 'reserve' ? 96 : 100, resetsAt: '2026-11-12T23:00:00.000Z' })

  it('the account reserve pauses the team (account-window) and keeps the person; exhausted stops the person too', () => {
    const r = rig()
    r.account.reserve = reserve('reserve')
    expect(r.admission.admit('loja', 'quadro')).toMatchObject({ ok: false, why: 'account-window', resumeAt: '2026-11-12T23:00:00.000Z' })
    expect(r.admission.admit('loja', 'person').ok).toBe(true)
    r.account.reserve = reserve('exhausted')
    expect(r.admission.admit('loja', 'person')).toMatchObject({ ok: false, why: 'account-window' })
  })

  it('no free slot is a refusal for everyone, and the turn is not counted', () => {
    const r = rig()
    r.slots.free = false
    expect(r.admission.admit('loja', 'person')).toMatchObject({ ok: false, why: 'slots' })
    expect(r.admission.admit('loja', 'quadro')).toMatchObject({ ok: false, why: 'slots' })
    expect(r.admission.loadOf('loja').turns.used).toBe(0)
    r.slots.free = true
    expect(r.admission.admit('loja', 'quadro').ok).toBe(true)
  })
})

describe('ProjectAdmission: the pause is an observable event', () => {
  it('a pause/full is told ONCE per (project, day, reason) with a deterministic key, and listed in order', () => {
    const r = rig()
    r.ceilings.set('loja', ceiling(20))
    spend(r, 'loja', 'person', 19)
    for (let i = 0; i < 5; i += 1) r.admission.admit('loja', 'quadro') // refused again and again
    expect(r.told).toHaveLength(1)
    expect(r.told[0]).toMatchObject({ projectId: 'loja', kind: 'pause', reason: 'turns', pct: 95, windowKey: '2026-11-12', key: 'project-pause:loja:2026-11-12:turns', resumeAt: '2026-11-13T03:00:00.000Z' })
    r.admission.admit('loja', 'person') // the 20th
    r.admission.admit('loja', 'person') // refused: full
    r.admission.admit('loja', 'person')
    expect(r.told.map(event => event.kind)).toEqual(['pause', 'full'])
    expect(r.admission.events('loja').map(event => event.kind)).toEqual(['pause', 'full'])
    expect(r.admission.events('obra')).toEqual([])
  })

  it('a quota pause carries the quota reason and key', () => {
    const r = rig()
    r.ceilings.set('loja', ceiling(200, 1000))
    r.tokens.set('loja', 960)
    r.admission.admit('loja', 'quadro')
    expect(r.told).toHaveLength(1)
    expect(r.told[0]).toMatchObject({ kind: 'pause', reason: 'quota', key: 'project-pause:loja:2026-11-12:quota' })
  })

  it('the window turns over at LOCAL midnight (UTC-3): the project resumes by itself, with exactly one resume event', () => {
    const r = rig('2026-11-13T02:30:00.000Z') // 23:30 on the 12th in São Paulo
    r.ceilings.set('loja', ceiling(4))
    spend(r, 'loja', 'person', 4)
    expect(r.admission.admit('loja', 'quadro')).toMatchObject({ ok: false, why: 'project-full', resumeAt: '2026-11-13T03:00:00.000Z' })
    r.clock.now = '2026-11-13T02:59:59.000Z'
    expect(r.admission.admit('loja', 'quadro').ok).toBe(false) // one second before local midnight
    r.clock.now = '2026-11-13T03:00:00.000Z' // 00:00 on the 13th
    expect(r.admission.admit('loja', 'quadro')).toMatchObject({ ok: true, load: { windowKey: '2026-11-13', turns: { used: 1, max: 4 } } })
    r.admission.admit('loja', 'quadro')
    r.clock.now = '2026-11-13T09:00:00.000Z'
    r.admission.admit('loja', 'quadro')
    expect(r.admission.events('loja').map(event => `${event.kind}:${event.windowKey}`)).toEqual(['full:2026-11-12', 'resume:2026-11-13'])
  })

  it('the journal is durable: a NEW admission over the same journal does not tell again, and still resumes once', () => {
    const r = rig('2026-11-12T20:00:00.000Z')
    r.ceilings.set('loja', ceiling(2))
    spend(r, 'loja', 'person', 2)
    r.admission.admit('loja', 'person') // full, told
    expect(r.told).toHaveLength(1)
    // the host closed and reopened on the same file: same journal and counters, a fresh object
    const told: ProjectPauseEvent[] = []
    const reopened = new ProjectAdmission({
      now: () => r.clock.now, offsetMinutes: () => SP, ceilingOf: () => ceiling(2),
      turnsOf: () => 2, bump: () => undefined, tokensOf: () => 0, accountReserve: () => undefined, slotFree: () => true,
      journal: { has: mark => r.journal.has(mark), put: (mark, event) => { r.journal.set(mark, event) }, list: projectId => [...r.journal.values()].filter(event => event.projectId === projectId) },
      onEvent: (event) => { told.push(event) },
    })
    reopened.admit('loja', 'person')
    expect(told).toEqual([]) // already told before the restart
    expect(reopened.events('loja').map(event => event.kind)).toEqual(['full'])
    r.clock.now = '2026-11-13T12:00:00.000Z'
    const next = new ProjectAdmission({
      now: () => r.clock.now, offsetMinutes: () => SP, ceilingOf: () => ceiling(2),
      turnsOf: () => 0, bump: () => undefined, tokensOf: () => 0, accountReserve: () => undefined, slotFree: () => true,
      journal: { has: mark => r.journal.has(mark), put: (mark, event) => { r.journal.set(mark, event) }, list: projectId => [...r.journal.values()].filter(event => event.projectId === projectId) },
      onEvent: (event) => { told.push(event) },
    })
    next.admit('loja', 'quadro')
    next.admit('loja', 'quadro')
    expect(told.map(event => event.kind)).toEqual(['resume'])
  })

  it('the day is the host time zone: the same instant is another day for another offset', () => {
    const r = rig('2026-11-13T01:00:00.000Z')
    expect(r.admission.loadOf('loja').windowKey).toBe('2026-11-12') // UTC-3: 22:00 on the 12th
    const utc = new ProjectAdmission({
      now: () => '2026-11-13T01:00:00.000Z', offsetMinutes: () => 0, ceilingOf: () => DEFAULT_CEILING,
      turnsOf: () => 0, bump: () => undefined, tokensOf: () => 0, accountReserve: () => undefined, slotFree: () => true,
      journal: { has: () => false, put: () => undefined, list: () => [] },
    })
    expect(utc.loadOf('loja').windowKey).toBe('2026-11-13')
  })
})

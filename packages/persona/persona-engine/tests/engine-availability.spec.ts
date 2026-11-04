import { describe, expect, it, vi } from 'vitest'
import { Engine, ENGINE_TRIGGER_CONFIRM_AFTER_MS, MemoryRepositories, UserError } from '../src/core/index.ts'
import type { DomainEvent, EngineOptions, Trigger } from '../src/core/index.ts'

function message(id: string, stream = 'geral'): Trigger {
  return { id, source: 'channel', threads: [{ source: 'channel', id: stream }],
    actor: { source: 'channel', id: 'person' }, human: true, addressed: 'mention',
    at: '2026-11-04T12:00:00.000Z', text: `private body ${id}`, meta: { secret: 'not for events' } }
}

function harness() {
  const repo = new MemoryRepositories()
  const events: DomainEvent[] = []
  let clock = Date.parse('2026-11-04T12:00:00.000Z')
  const assessor = { request: vi.fn<EngineOptions['assessor']['request']>(), release: vi.fn<NonNullable<EngineOptions['assessor']['release']>>() }
  const executor = { start: vi.fn<EngineOptions['executor']['start']>(), deliver: vi.fn<EngineOptions['executor']['deliver']>(),
    stop: vi.fn<EngineOptions['executor']['stop']>() }
  const options: EngineOptions = {
    repo, now: () => new Date(clock).toISOString(), emit: (event) => { events.push(event) },
    scope: { scope: () => ({ listened: true, observed: false }) },
    assessor, executor,
    outbox: { send: vi.fn(), status: () => undefined, withdraw: vi.fn() },
    policy: () => ({ version: '1', paused: false, evalTimeoutMs: 60_000,
      gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
      revalidate: () => true, admitsInferred: () => true }),
  }
  const engine = new Engine(options)
  return { repo, events, options, assessor, executor, engine, advance: (ms: number): void => { clock += ms } }
}

const accept = { kind: 'accept', title: 'Deliver', scope: 'small', reason: 'person request' } as const

describe('connection admission', () => {
  it('persists a deferred message and emits only safe connection fields synchronously', () => {
    const h = harness()
    expect(h.engine.receive(message('a'), { deferRouting: true })).toBe('stored')
    expect(h.engine.engineUnavailable('a', 'login_required')).toBe(true)
    h.engine.evaluateDue()
    expect(h.events.filter(event => event.type === 'no_engine_ready')).toMatchInlineSnapshot(`
      [
        {
          "at": "2026-11-04T12:00:00.000Z",
          "data": {
            "reason": "login_required",
            "streamId": "channel:geral",
            "triggerId": "a",
          },
          "type": "no_engine_ready",
        },
      ]
    `)
    expect(h.repo.triggers.get('a')).toEqual(message('a'))
    expect(h.repo.threads.get('channel:geral')?.pending).toEqual(['a'])
    expect(h.assessor.request).not.toHaveBeenCalled()
    expect(h.executor.start).not.toHaveBeenCalled()
    expect(h.repo.tickets.list()).toEqual([])
    expect(() => h.engine.decide('a', accept)).toThrow(new UserError('engineUnavailable'))
  })

  it('keeps ordinary intake and immediate execution unchanged with a ready engine', () => {
    const h = harness()
    h.engine.receive(message('a'))
    h.engine.evaluateDue()
    expect(h.assessor.request).toHaveBeenCalledOnce()
    h.engine.decide('a', accept)
    expect(h.executor.start).toHaveBeenCalledOnce()
    expect(h.events.some(event => event.type === 'no_engine_ready')).toBe(false)
    expect(h.engine.engineReady('a')).toBeUndefined()
  })

  it('deduplicates reception and notification across engine reconstruction', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.engine.engineUnavailable('a')
    const restarted = new Engine(h.options)
    expect(restarted.receive(message('a'), { deferRouting: true })).toBe('duplicate')
    expect(restarted.engineUnavailable('a', 'quota_exhausted')).toBe(false)
    expect(restarted.pendingEngineTriggers()).toEqual([message('a')])
    expect(h.events.filter(event => event.type === 'no_engine_ready')).toHaveLength(1)
  })

  it('releases once and cannot create a second ticket on retry', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.engine.engineUnavailable('a')
    expect(h.engine.engineReady('a')).toEqual(message('a'))
    h.engine.evaluateDue()
    const first = h.engine.decide('a', accept)
    expect(h.engine.engineReady('a')).toBeUndefined()
    expect(h.engine.engineUnavailable('a')).toBe(false)
    expect(h.engine.decide('a', accept)).toEqual(first)
    expect(h.repo.tickets.list()).toHaveLength(1)
    expect(h.executor.start).toHaveBeenCalledOnce()
    expect(h.engine.pendingEngineTriggers()).toEqual([])
  })

  it('preserves stream arrival order, including a new message received after reconnection', () => {
    const h = harness()
    h.engine.receive(message('old'), { deferRouting: true })
    h.engine.engineUnavailable('old')
    h.engine.receive(message('middle'), { deferRouting: true })
    h.engine.receive(message('new'))
    expect(h.engine.engineReady('new')).toBeUndefined()
    expect(h.engine.engineReady('middle')).toBeUndefined()
    h.engine.evaluateDue()
    expect(h.assessor.request).not.toHaveBeenCalled()
    expect(h.engine.pendingEngineTriggers().map(trigger => trigger.id)).toEqual(['old', 'middle', 'new'])
    const replayed = h.engine.pendingEngineTriggers().flatMap(trigger => h.engine.engineReady(trigger.id) ?? [])
    expect(replayed.map(trigger => trigger.id)).toEqual(['old', 'middle', 'new'])
    h.engine.evaluateDue()
    expect(h.assessor.request).toHaveBeenCalledWith(expect.objectContaining({
      triggers: [message('old'), message('middle'), message('new')],
    }))
  })

  it('does not block another stream behind a retained stream', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.engine.receive(message('b', 'other'))
    h.engine.evaluateDue()
    expect(h.assessor.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ triggers: [message('b', 'other')] }))
    expect(h.engine.pendingEngineTriggers()).toEqual([message('a')])
  })

  it('dismisses a retained message permanently and frees the next stream head', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.engine.engineUnavailable('a')
    h.engine.receive(message('b'), { deferRouting: true })
    expect(h.engine.dismissEngineTrigger('a')).toBe(true)
    expect(h.engine.dismissEngineTrigger('a')).toBe(false)
    expect(h.engine.engineReady('a', { confirmed: true })).toBeUndefined()
    expect(h.engine.engineUnavailable('a')).toBe(false)
    expect(() => h.engine.decide('a', accept)).toThrow(new UserError('engineUnavailable'))
    expect(h.engine.engineReady('b')).toEqual(message('b'))
    expect(h.repo.triggers.get('a')).toEqual(message('a'))
  })

  it('requires explicit confirmation at the expiration threshold and notifies only once', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.engine.engineUnavailable('a')
    h.advance(ENGINE_TRIGGER_CONFIRM_AFTER_MS)
    expect(ENGINE_TRIGGER_CONFIRM_AFTER_MS).toBe(86_400_000)
    expect(h.engine.engineReady('a')).toBeUndefined()
    expect(new Engine(h.options).engineReady('a')).toBeUndefined()
    h.engine.evaluateDue()
    expect(h.assessor.request).not.toHaveBeenCalled()
    expect(h.events.filter(event => event.type === 'engine_confirmation_required')).toEqual([{
      type: 'engine_confirmation_required', at: '2026-11-05T12:00:00.000Z',
      data: { triggerId: 'a', streamId: 'channel:geral', reason: 'expired' },
    }])
    expect(h.engine.engineReady('a', { confirmed: true })).toEqual(message('a'))
    expect(h.engine.engineReady('a', { confirmed: true })).toBeUndefined()
  })

  it('releases automatically just before the expiration threshold', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.advance(ENGINE_TRIGGER_CONFIRM_AFTER_MS - 1)
    expect(h.engine.engineReady('a')).toEqual(message('a'))
  })

  it('preserves required confirmation when a delayed connection notification arrives', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.advance(ENGINE_TRIGGER_CONFIRM_AFTER_MS)
    h.engine.engineReady('a')
    expect(h.engine.engineUnavailable('a')).toBe(true)
    expect(h.engine.engineReady('a')).toBeUndefined()
    expect(h.repo.triggers.disposition('a')?.engineWait?.state).toBe('confirmation_required')
    expect(h.events.filter(event => event.type === 'engine_confirmation_required')).toHaveLength(1)
  })

  it('does not let a fresh message overtake an expired conversation head', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    h.advance(ENGINE_TRIGGER_CONFIRM_AFTER_MS + 1)
    h.engine.receive(message('b'))
    expect(h.engine.engineReady('a')).toBeUndefined()
    expect(h.engine.engineReady('b')).toBeUndefined()
    h.engine.dismissEngineTrigger('a')
    expect(h.engine.engineReady('b')).toEqual(message('b'))
  })

  it('does not fan out, wake, or start an assignment for an ended ticket while deferred', () => {
    const h = harness()
    h.engine.receive(message('original'))
    const decision = h.engine.decide('original', accept)
    const ticketId = decision.ticketId!
    const assignment = h.repo.tickets.get(ticketId)!.assignments[0]!
    h.engine.assignmentStarted(ticketId, assignment.id)
    h.engine.report(ticketId, { state: 'ready', summary: 'done' })
    expect(h.repo.tickets.get(ticketId)?.ended).toBeDefined()
    vi.mocked(h.executor.start).mockClear()
    h.engine.receive(message('followup'), { deferRouting: true })
    h.engine.engineUnavailable('followup')
    h.engine.evaluateDue()
    expect(h.repo.tickets.get(ticketId)?.assignments).toHaveLength(1)
    expect(h.repo.triggers.disposition('followup')?.fanout).toEqual([])
    expect(h.executor.start).not.toHaveBeenCalled()
    expect(h.executor.deliver).not.toHaveBeenCalled()
    expect(() => h.engine.attach(ticketId, 'followup')).toThrow(new UserError('engineUnavailable'))
    expect(h.engine.engineReady('followup')).toEqual(message('followup'))
    expect(h.engine.engineReady('followup')).toBeUndefined()
    expect(h.repo.tickets.get(ticketId)?.assignments).toHaveLength(2)
    expect(h.executor.start).toHaveBeenCalledOnce()
    expect(h.repo.triggers.disposition('followup')?.fanout).toEqual([ticketId])
  })

  it('discards notification and wait updates when an outer transaction rolls back', () => {
    const h = harness()
    h.engine.receive(message('a'), { deferRouting: true })
    expect(() => h.repo.atomic(() => { h.engine.engineUnavailable('a'); throw new Error('rollback') })).toThrow('rollback')
    expect(h.events.filter(event => event.type === 'no_engine_ready')).toEqual([])
    expect(h.engine.engineUnavailable('a')).toBe(true)
  })
})

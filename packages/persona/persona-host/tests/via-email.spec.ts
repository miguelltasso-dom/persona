import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it } from 'vitest'
import { cameByEmail } from '../src/via-email.ts'

/** S1 P0-03b: the "someone else's e-mail is behind this Task" mark travels through handoffs, split parts, held batches and later inputs. */
const at = '2026-11-12T10:00:00.000Z'
const ticket = (id: string, triggerId: string, over: Partial<Ticket> = {}): Ticket => ({
  id, title: id, decisionId: 'd', mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
  channels: [], assignments: [], inputs: [], undelivered: [], createdAt: at, updatedAt: at, origin: { triggerId, triggerIds: [triggerId] }, ...over,
})

function world(tickets: Ticket[], mailIds: string[]) {
  const byId = new Map(tickets.map(row => [row.id, row]))
  return {
    trigger: (id: string) => (mailIds.includes(id) ? { viaEmail: true as const } : id === '' ? undefined : { }),
    ticket: (id: string) => byId.get(id),
  }
}

describe('cameByEmail', () => {
  it('a Task started by the e-mail itself', () => {
    expect(cameByEmail(ticket('t1', 'mail:m1'), world([], ['mail:m1']))).toBe(true)
  })
  it('a Task the person started is not marked', () => {
    expect(cameByEmail(ticket('t1', 'u1'), world([], ['mail:m1']))).toBe(false)
  })
  it('a colleague\'s Task (handoff) inherits it from the Task that asked, and from the asker\'s asker', () => {
    const t1 = ticket('t1', 'mail:m1')
    const t2 = ticket('t2', 'handoff:t1:c1')
    const t3 = ticket('t3', 'handoff:t2:c9')
    const all = world([t1, t2, t3], ['mail:m1'])
    expect(cameByEmail(t2, all)).toBe(true)
    expect(cameByEmail(t3, all)).toBe(true)
  })
  it('a handoff from a Task the person started stays unmarked', () => {
    const t1 = ticket('t1', 'u1')
    expect(cameByEmail(ticket('t2', 'handoff:t1:c1'), world([t1], ['mail:m1']))).toBe(false)
  })
  it('a part of a split request is made from the message it was split from', () => {
    expect(cameByEmail(ticket('p1', 'split:mail:m1:nina'), world([], ['mail:m1']))).toBe(true)
    expect(cameByEmail(ticket('p1', 'split:u1:nina'), world([], ['mail:m1']))).toBe(false)
  })
  it('the batch its Eval held and the inputs it absorbed later count', () => {
    const batch = ticket('t1', 'u1', { origin: { triggerId: 'u1', triggerIds: ['u1', 'mail:m2'] } })
    expect(cameByEmail(batch, world([], ['mail:m2']))).toBe(true)
    const later = ticket('t1', 'u1', { inputs: [{ id: 'i1', kind: 'trigger', triggerId: 'mail:m3', at }] })
    expect(cameByEmail(later, world([], ['mail:m3']))).toBe(true)
    const note = ticket('t1', 'u1', { inputs: [{ id: 'i2', kind: 'note', text: 'mail:m3', at } as never] })
    expect(cameByEmail(note, world([], ['mail:m3']))).toBe(false)
  })
  it('an event a routine listens to counts as someone else\'s text too', () => {
    expect(cameByEmail(ticket('t1', 'routine-run:r1@event:mail:m1:0'), world([], []))).toBe(true)
    expect(cameByEmail(ticket('t2', 'handoff:t1:c1'), world([ticket('t1', 'routine-run:r1@event:mail:m1:0')], []))).toBe(true)
  })
  it('a cycle of Tasks is cut, and a very long chain is not trusted', () => {
    const a = ticket('a', 'handoff:b:c1')
    const b = ticket('b', 'handoff:a:c2')
    expect(cameByEmail(a, world([a, b], []))).toBe(false)
    const chain: Ticket[] = Array.from({ length: 40 }, (_, n) => ticket(`c${String(n)}`, n === 0 ? 'u1' : `handoff:c${String(n - 1)}:x`))
    expect(cameByEmail(chain[39]!, world(chain, []))).toBe(true) // too deep to read: the safe answer
  })
})

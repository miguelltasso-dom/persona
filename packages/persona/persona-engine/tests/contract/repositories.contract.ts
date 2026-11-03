/**
 * Repository contract suite. Parameterize with a factory; Anvil runs the same
 * suite against SQLite. Memory must stay green here and in core-engine.spec.
 */

import { describe, expect, it } from 'vitest'
import type { Decision, Repositories, Thread, Ticket, Trigger } from '../../src/index.ts'

export type RepositoryFactory = (projectId: string) => Repositories

const at = '2026-11-03T14:00:00.000Z'
const actor = { source: 'channel', id: 'ana' }

function trigger(id: string): Trigger {
  return {
    id,
    source: 'channel',
    threads: [{ source: 'channel', id: 'geral' }],
    actor,
    human: true,
    at,
    text: `msg ${id}`,
    channel: { source: 'channel', thread: 'geral', address: { message: id } },
    meta: {},
  }
}

function thread(key: string, overrides: Partial<Thread> = {}): Thread {
  return {
    key,
    ref: { source: 'channel', id: 'geral' },
    createdAt: at,
    subscriptions: [],
    correlated: [],
    pending: [],
    meta: {},
    ...overrides,
  }
}

function ticket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    title: id,
    decisionId: 'd1',
    mandate: {
      strength: 'explicit',
      policyVersion: 'v1',
      basis: { via: 'listed' },
      actor,
      scope: 'small',
    },
    channels: [],
    assignments: [{ id: `a-${id}`, state: 'pending', createdAt: at }],
    inputs: [],
    undelivered: [],
    createdAt: at,
    updatedAt: at,
    origin: { triggerId: 't1', triggerIds: ['t1'] },
    ...overrides,
  }
}

function decision(id: string, threadKey = 'channel:geral'): Decision {
  return {
    id,
    evalId: `e-${id}`,
    threadKey,
    triggerIds: ['t1'],
    policyVersion: 'v1',
    at,
    kind: 'accept',
    reason: [],
    strength: 'explicit',
    ticketId: 'ticket-1',
  }
}

/**
 * Shared behavioral contract for any {@link Repositories} implementation.
 * @param factory - Builds an empty repository bound to `projectId`.
 */
export function defineRepositoryContract(factory: RepositoryFactory): void {
  describe('Repositories contract', () => {
    it('binds the instance to one project_id (D-038)', () => {
      expect(factory('launch').projectId).toBe('launch')
      expect(factory('ops').projectId).toBe('ops')
    })

    it('isolates two projects from each other', () => {
      const launch = factory('launch')
      const ops = factory('ops')
      launch.triggers.save(trigger('e1'))
      expect(launch.triggers.get('e1')?.id).toBe('e1')
      expect(ops.triggers.get('e1')).toBeUndefined()
    })

    it('returns undefined for a missing trigger, thread, ticket, decision, and disposition', () => {
      const repo = factory('launch')
      expect(repo.triggers.get('missing')).toBeUndefined()
      expect(repo.triggers.disposition('missing')).toBeUndefined()
      expect(repo.threads.get('missing')).toBeUndefined()
      expect(repo.tickets.get('missing')).toBeUndefined()
      expect(repo.decisions.get('missing')).toBeUndefined()
    })

    it('round-trips a trigger and isolates the stored clone from later mutation', () => {
      const repo = factory('launch')
      const saved = trigger('e1')
      repo.triggers.save(saved)
      saved.text = 'mutated'
      expect(repo.triggers.get('e1')?.text).toBe('msg e1')
      const read = repo.triggers.get('e1')
      if (read === undefined) throw new Error('expected trigger')
      read.text = 'caller'
      expect(repo.triggers.get('e1')?.text).toBe('msg e1')
    })

    it('upserts a trigger on save', () => {
      const repo = factory('launch')
      repo.triggers.save(trigger('e1'))
      repo.triggers.save({ ...trigger('e1'), text: 'updated' })
      expect(repo.triggers.get('e1')?.text).toBe('updated')
    })

    it('round-trips trigger disposition', () => {
      const repo = factory('launch')
      repo.triggers.saveDisposition('e1', { fanout: ['ticket-1'], at })
      expect(repo.triggers.disposition('e1')).toEqual({ fanout: ['ticket-1'], at })
    })

    it('round-trips a thread and lists every stored thread', () => {
      const repo = factory('launch')
      repo.threads.save(thread('channel:geral'))
      repo.threads.save(thread('channel:ops', { ref: { source: 'channel', id: 'ops' } }))
      expect(repo.threads.get('channel:geral')?.ref.id).toBe('geral')
      expect(repo.threads.list().map(item => item.key).sort()).toEqual(['channel:geral', 'channel:ops'])
    })

    it('lists active threads as those with pending triggers or an eval in progress', () => {
      const repo = factory('launch')
      repo.threads.save(thread('idle'))
      repo.threads.save(thread('queued', { pending: ['e1'] }))
      expect(repo.threads.active().map(item => item.key)).toEqual(['queued'])
    })

    it('round-trips a ticket and lists newest first', () => {
      const repo = factory('launch')
      repo.tickets.save(ticket('old'))
      repo.tickets.save(ticket('new'))
      expect(repo.tickets.list().map(item => item.id)).toEqual(['new', 'old'])
      expect(repo.tickets.get('old')?.title).toBe('old')
    })

    it('lists open tickets as those without ended', () => {
      const repo = factory('launch')
      repo.tickets.save(ticket('live'))
      repo.tickets.save(ticket('done', { ended: { at, by: 'human', outcome: 'stopped' } }))
      expect(repo.tickets.open().map(item => item.id)).toEqual(['live'])
    })

    it('lists active tickets as those with undelivered inputs or a live assignment', () => {
      const repo = factory('launch')
      repo.tickets.save(ticket('pending'))
      repo.tickets.save(ticket('quiet', { assignments: [{ id: 'a', state: 'ended', createdAt: at }] }))
      repo.tickets.save(ticket('waiting', {
        assignments: [{ id: 'a', state: 'ended', createdAt: at }],
        undelivered: ['i1'],
      }))
      expect(repo.tickets.active().map(item => item.id).sort()).toEqual(['pending', 'waiting'])
    })

    it('isolates a ticket clone returned from get', () => {
      const repo = factory('launch')
      repo.tickets.save(ticket('t'))
      const read = repo.tickets.get('t')
      if (read === undefined) throw new Error('expected ticket')
      read.title = 'changed'
      expect(repo.tickets.get('t')?.title).toBe('t')
    })

    it('round-trips a decision and filters by thread', () => {
      const repo = factory('launch')
      repo.decisions.save(decision('d1', 'channel:geral'))
      repo.decisions.save(decision('d2', 'channel:ops'))
      expect(repo.decisions.get('d1')?.kind).toBe('accept')
      expect(repo.decisions.byThread('channel:geral').map(item => item.id)).toEqual(['d1'])
    })

    it('commits work inside atomic', () => {
      const repo = factory('launch')
      repo.atomic(() => { repo.triggers.save(trigger('e1')) })
      expect(repo.triggers.get('e1')?.id).toBe('e1')
    })

    it('rolls back atomic work when the callback throws', () => {
      const repo = factory('launch')
      repo.triggers.save(trigger('keep'))
      expect(() => repo.atomic(() => {
        repo.triggers.save(trigger('gone'))
        throw new Error('boom')
      })).toThrow('boom')
      expect(repo.triggers.get('keep')?.id).toBe('keep')
      expect(repo.triggers.get('gone')).toBeUndefined()
    })

    it('runs afterCommit immediately outside a transaction', () => {
      const repo = factory('launch')
      const seen: string[] = []
      repo.afterCommit(() => { seen.push('now') })
      expect(seen).toEqual(['now'])
    })

    it('runs afterCommit only after the outermost atomic commits', () => {
      const repo = factory('launch')
      const seen: string[] = []
      repo.atomic(() => {
        repo.afterCommit(() => { seen.push('outer') })
        repo.atomic(() => { repo.afterCommit(() => { seen.push('inner') }) })
        expect(seen).toEqual([])
      })
      expect(seen).toEqual(['outer', 'inner'])
    })

    it('discards afterCommit hooks when atomic rolls back', () => {
      const repo = factory('launch')
      const seen: string[] = []
      expect(() => repo.atomic(() => {
        repo.afterCommit(() => { seen.push('nope') })
        throw new Error('fail')
      })).toThrow('fail')
      expect(seen).toEqual([])
    })

    it('discards nested afterCommit hooks when the outer atomic rolls back', () => {
      const repo = factory('launch')
      const seen: string[] = []
      expect(() => repo.atomic(() => {
        repo.atomic(() => { repo.afterCommit(() => { seen.push('inner') }) })
        throw new Error('outer-fail')
      })).toThrow('outer-fail')
      expect(seen).toEqual([])
    })

    it('does not leak a rolled-back ticket into list or open', () => {
      const repo = factory('launch')
      expect(() => repo.atomic(() => {
        repo.tickets.save(ticket('ghost'))
        throw new Error('no')
      })).toThrow('no')
      expect(repo.tickets.list()).toEqual([])
      expect(repo.tickets.open()).toEqual([])
    })

    it('keeps a committed ticket after a later atomic failure', () => {
      const repo = factory('launch')
      repo.atomic(() => { repo.tickets.save(ticket('keep')) })
      expect(() => repo.atomic(() => {
        repo.tickets.save(ticket('drop'))
        throw new Error('no')
      })).toThrow('no')
      expect(repo.tickets.list().map(item => item.id)).toEqual(['keep'])
    })
  })
}

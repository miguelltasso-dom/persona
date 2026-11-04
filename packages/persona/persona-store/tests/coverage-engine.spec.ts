import { afterEach, expect, it } from 'vitest'
import {
  openPersonaStore,
  SqliteEffectPersistence,
  SqliteOutbox,
  SqliteSyncLog,
  type PersonaStore,
} from '../src/index.ts'

const stores: PersonaStore[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function open(): PersonaStore {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  return store
}

it('effects cover upsert generation, due/oldest, pending, unknown kind, and nextSeq', () => {
  const persist = new SqliteEffectPersistence(open(), 'p')
  expect(persist.nextSeq()).toBe(1)
  expect(persist.nextSeq()).toBe(2)
  persist.upsert('launch', 'a', '{}', 1, 10)
  persist.upsert('launch', 'a', '{"v":2}', 1, 20)
  expect(persist.get('launch', 'a')?.generation).toBe(1)
  expect(persist.get('launch', 'a')?.due).toBe(20)
  persist.upsert('notice', 'b', '{}', 2, 5)
  expect(persist.due('launch', 15, 10)).toEqual([])
  expect(persist.due('launch', 20, 10)).toHaveLength(1)
  expect(persist.oldest('launch')?.key).toBe('a')
  expect(persist.oldest('relay')).toBeUndefined()
  expect(persist.pending('launch')).toBe(true)
  expect(persist.pending('launch', 'a')).toBe(true)
  expect(persist.pending('launch', 'missing')).toBe(false)
  persist.markAttempt('launch', 'a', 3, 99)
  expect(persist.get('launch', 'a')?.attempts).toBe(3)
  persist.delete('launch', 'a')
  expect(persist.get('launch', 'a')).toBeUndefined()
  expect(() => persist.store.db.prepare(
    'SELECT kind FROM engine_effect WHERE project_id = ?',
  )).not.toThrow()
  persist.store.tx((db) => {
    db.prepare(
      'INSERT INTO engine_effect (project_id, kind, key, payload, seq, generation, attempts, due) VALUES (?, ?, ?, ?, 1, 0, 0, 0)',
    ).run('p', 'bogus', 'x', '{}')
  })
  expect(() => persist.get('bogus' as never, 'x')).toThrow(/unknown effect kind/u)
})

it('outbox covers withdraw of settled, pass of missing, default clock, and bad status', () => {
  const store = open()
  const box = new SqliteOutbox(store, 'p')
  const message = {
    id: 'm1',
    channel: { source: 'channel', thread: 'geral', address: { message: 'm1' } },
    text: 'hi',
    kind: 'reply' as const,
    ticketId: 't1',
  }
  box.send(message)
  box.withdraw('missing')
  expect(box.settle('nope', 'sent')).toBeUndefined()
  expect(box.pass('sent', ['ghost'])).toEqual([])
  box.pass('sent')
  box.withdraw('m1')
  expect(box.status('m1')).toBe('sent')
})

it('sync log covers empty head, snapshot, after, and invalid head', () => {
  const store = open()
  const log = new SqliteSyncLog(store)
  expect(log.head('channel:geral')).toBe(0)
  expect(log.after('channel:geral', 0)).toEqual([])
  expect(log.snapshot()).toEqual([])
  expect(log.byIdempotency('none')).toBeUndefined()
  store.tx((db) => {
    db.prepare(
      `INSERT INTO sync_envelope (workspace_id, stream_id, seq, idempotency_key, classification, at, shared, body)
       VALUES ('ws', 'channel:geral', 1, 'k', 'channel', '2026-11-03T15:00:00Z', 1, ?)`,
    ).run(JSON.stringify({
      workspaceId: 'ws', streamId: 'channel:geral', seq: 1, idempotencyKey: 'k',
      classification: 'channel', at: '2026-11-03T15:00:00Z', payload: { v: 1 },
    }))
  })
  expect(log.head('channel:geral')).toBe(1)
  expect(log.snapshot()).toHaveLength(1)
})

it('store.tx aborts every Nth write and rolls back', () => {
  const store = open()
  let n = 0
  const write = (id: string): void => {
    n += 1
    store.tx((db) => {
      db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
        id, id, '2026-11-03T15:00:00.000Z', '2026-11-03T15:00:00.000Z',
      )
      if (n % 2 === 0) throw new Error('abort-n')
    })
  }
  write('a')
  expect(() => { write('b') }).toThrow('abort-n')
  const rows = store.db.prepare('SELECT id FROM workspace ORDER BY id').all() as Array<{ id: string }>
  expect(rows.map(item => item.id)).toEqual(['a'])
  write('c')
  expect(() => { write('d') }).toThrow('abort-n')
  const again = store.db.prepare('SELECT id FROM workspace ORDER BY id').all() as Array<{ id: string }>
  expect(again.map(item => item.id)).toEqual(['a', 'c'])
})

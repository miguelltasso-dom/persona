import { afterEach, expect, it } from 'vitest'
import { EffectQueue, Later } from '@deepseek-ai/dsh-persona-engine'
import {
  openPersonaStore,
  openSqliteRepositories,
  openTempStore,
  SqliteEffectPersistence,
  SqliteOutbox,
  type PersonaStore,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []
const memories: PersonaStore[] = []
afterEach(async () => {
  for (const store of memories.splice(0)) store.close()
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

const message = (id: string, ticketId = 't1', thread = 'geral') => ({
  id,
  channel: { source: 'channel', thread, address: { message: id } },
  text: `hi ${id}`,
  kind: 'reply' as const,
  ticketId,
})

it('reopen preserves engine documents', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const repo = openSqliteRepositories(handle.store, 'launch')
  repo.triggers.save({
    id: 'e1',
    source: 'channel',
    threads: [{ source: 'channel', id: 'geral' }],
    actor: { source: 'channel', id: 'ana' },
    human: true,
    at: '2026-11-03T14:00:00.000Z',
    text: 'keep',
    meta: {},
  })
  handle.store.close()
  const again = openPersonaStore({ path: handle.path })
  memories.push(again)
  expect(openSqliteRepositories(again, 'launch').triggers.get('e1')?.text).toBe('keep')
  expect(openSqliteRepositories(again, 'ops').triggers.get('e1')).toBeUndefined()
})

it('does not dispatch an effect until afterCommit of the enclosing atomic', async () => {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  const persist = new SqliteEffectPersistence(store, 'launch')
  const repo = openSqliteRepositories(store, 'launch')
  const ran: string[] = []
  const queue = new EffectQueue(persist, repo)
  queue.handle('launch', { run: async (_payload, key) => { ran.push(key) } })
  queue.start()
  repo.atomic(() => {
    queue.enqueue('launch', 'a1', { ticketId: 't1', assignmentId: 'a1' })
    expect(persist.pending('launch', 'a1')).toBe(false)
    expect(ran).toEqual([])
  })
  expect(persist.pending('launch', 'a1')).toBe(true)
  await queue.idle()
  expect(ran).toEqual(['a1'])
  expect(persist.pending('launch', 'a1')).toBe(false)
})

it('discards an enqueued effect when atomic rolls back', async () => {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  const persist = new SqliteEffectPersistence(store, 'launch')
  const repo = openSqliteRepositories(store, 'launch')
  const ran: string[] = []
  const queue = new EffectQueue(persist, repo)
  queue.handle('delivery', { run: async (_payload, key) => { ran.push(key) } })
  queue.start()
  expect(() => repo.atomic(() => {
    queue.enqueue('delivery', 't1', { ticketId: 't1' })
    throw new Error('nope')
  })).toThrow('nope')
  await queue.idle()
  expect(ran).toEqual([])
  expect(persist.pending('delivery', 't1')).toBe(false)
})

it('reschedules Later without incrementing attempts', async () => {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  const persist = new SqliteEffectPersistence(store, 'launch')
  const repo = openSqliteRepositories(store, 'launch')
  let blocked = true
  const queue = new EffectQueue(persist, repo, () => 1_000)
  queue.handle('reply', {
    run: async () => {
      if (blocked) throw new Later()
    },
  })
  queue.start()
  queue.enqueue('reply', 'm1', {})
  await queue.idle()
  expect(persist.get('reply', 'm1')?.attempts).toBe(0)
  blocked = false
  persist.markAttempt('reply', 'm1', 0, 1_000)
  await queue.idle()
  expect(persist.pending('reply', 'm1')).toBe(false)
})

it('replays a pending effect after reopen', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const persist = new SqliteEffectPersistence(handle.store, 'launch')
  persist.upsert('notice', 'prompts', JSON.stringify({ value: {}, summary: 'ok' }), persist.nextSeq(), 0)
  handle.store.close()
  const again = openPersonaStore({ path: handle.path })
  memories.push(again)
  const replay = new SqliteEffectPersistence(again, 'launch')
  expect(replay.pending('notice', 'prompts')).toBe(true)
  expect(replay.get('notice', 'prompts')?.generation).toBe(0)
})

it('queues a message once and keeps the first text', () => {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  const box = new SqliteOutbox(store, 'launch', () => '2026-11-03T14:00:00.000Z')
  box.send(message('m1'))
  box.send({ ...message('m1'), text: 'other' })
  expect(box.status('m1')).toBe('pending')
  expect(box.pending()).toEqual([expect.objectContaining({ id: 'm1', text: 'hi m1' })])
})

it('orders pending by ticket then conversation', () => {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  const box = new SqliteOutbox(store, 'launch', () => '2026-11-03T14:00:00.000Z')
  box.send(message('b', 't2', 'ops'))
  box.send(message('a', 't1', 'zeta'))
  box.send(message('c', 't1', 'geral'))
  expect(box.pending().map(item => item.id)).toEqual(['c', 'a', 'b'])
})

it('withdraws only a pending message', () => {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  const box = new SqliteOutbox(store, 'launch', () => '2026-11-03T14:00:00.000Z')
  box.send(message('m1'))
  box.withdraw('m1')
  expect(box.status('m1')).toBeUndefined()
  expect(box.pending()).toEqual([])
})

it('settles pending without re-sending', () => {
  const store = openPersonaStore({ path: ':memory:' })
  memories.push(store)
  const box = new SqliteOutbox(store, 'launch', () => '2026-11-03T14:00:00.000Z')
  box.send(message('m1'))
  box.send(message('m2'))
  expect(box.settle('m1', 'sent')).toEqual({ id: 'm1', status: 'sent', at: '2026-11-03T14:00:00.000Z' })
  expect(box.pass('dropped')).toEqual([
    { id: 'm2', status: 'dropped', at: '2026-11-03T14:00:00.000Z' },
  ])
  expect(box.pass('sent')).toEqual([])
  expect(box.history().map(item => item.status)).toEqual(['sent', 'dropped'])
  box.withdraw('m1')
  expect(box.status('m1')).toBe('sent')
})

import { expect, it } from 'vitest'
import { EffectQueue, Later, MemoryEffectPersistence, MemoryRepositories } from '../src/index.ts'

it('does not dispatch an effect until afterCommit of the enclosing atomic', async () => {
  const persist = new MemoryEffectPersistence()
  const repo = new MemoryRepositories('launch')
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
  const persist = new MemoryEffectPersistence()
  const repo = new MemoryRepositories('launch')
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
  const persist = new MemoryEffectPersistence()
  const repo = new MemoryRepositories('launch')
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

it('cancel drops a waiting row', () => {
  const persist = new MemoryEffectPersistence()
  const repo = new MemoryRepositories('launch')
  const queue = new EffectQueue(persist, repo)
  queue.enqueue('notice', 'prompts', { value: {}, summary: 'ok' })
  expect(queue.pending('notice', 'prompts')).toBe(true)
  queue.cancel('notice', 'prompts')
  expect(queue.pending('notice')).toBe(false)
})

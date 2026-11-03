import { expect, it } from 'vitest'
import { EffectQueue, MemoryEffectPersistence, MemoryRepositories } from '../../src/index.ts'

it('outbox só após commit: enqueue dentro de atomic só despacha depois do commit; rollback descarta', async () => {
  const persist = new MemoryEffectPersistence()
  const repo = new MemoryRepositories('launch')
  const ran: string[] = []
  const queue = new EffectQueue(persist, repo)
  queue.handle('launch', { run: async (_payload, key) => { ran.push(key) } })
  queue.start()
  repo.atomic(() => {
    queue.enqueue('launch', 'a1', { ticketId: 't1', assignmentId: 'a1' })
    expect(ran).toEqual([])
    expect(persist.pending('launch', 'a1')).toBe(false)
  })
  expect(persist.pending('launch', 'a1')).toBe(true)
  await queue.idle()
  expect(ran).toEqual(['a1'])
  expect(() => repo.atomic(() => {
    queue.enqueue('launch', 'a2', { ticketId: 't2', assignmentId: 'a2' })
    throw new Error('rollback')
  })).toThrow('rollback')
  await queue.idle()
  expect(ran).toEqual(['a1'])
})

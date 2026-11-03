import { expect, it } from 'vitest'
import { MemoryOutbox } from '../src/index.ts'

const message = (id: string) => ({
  id,
  channel: { source: 'channel', thread: 'geral', address: { message: id } },
  text: `hi ${id}`,
  kind: 'reply' as const,
  ticketId: 't1',
})

it('queues a message once and keeps the first text', () => {
  const box = new MemoryOutbox(() => '2026-11-03T14:00:00.000Z')
  box.send(message('m1'))
  box.send({ ...message('m1'), text: 'other' })
  expect(box.status('m1')).toBe('pending')
  expect(box.pending()).toEqual([expect.objectContaining({ id: 'm1', text: 'hi m1' })])
})

it('withdraws only a pending message', () => {
  const box = new MemoryOutbox(() => '2026-11-03T14:00:00.000Z')
  box.send(message('m1'))
  box.withdraw('m1')
  expect(box.status('m1')).toBeUndefined()
  expect(box.pending()).toEqual([])
})

it('records sent and dropped passes without re-sending', () => {
  const box = new MemoryOutbox(() => '2026-11-03T14:00:00.000Z')
  box.send(message('m1'))
  box.send(message('m2'))
  expect(box.pass('sent', ['m1'])).toEqual([
    { id: 'm1', status: 'sent', at: '2026-11-03T14:00:00.000Z' },
  ])
  expect(box.pass('dropped')).toEqual([
    { id: 'm2', status: 'dropped', at: '2026-11-03T14:00:00.000Z' },
  ])
  expect(box.pass('sent')).toEqual([])
  expect(box.history().map(item => item.status)).toEqual(['sent', 'dropped'])
  box.withdraw('m1')
  expect(box.status('m1')).toBe('sent')
})

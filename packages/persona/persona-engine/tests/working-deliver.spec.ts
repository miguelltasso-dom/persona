import { expect, it } from 'vitest'
import { deliverWorkingSend, flushWorkingQueue } from '../src/index.ts'
import type { DeliverMode } from '../src/index.ts'

it('steers when idle and queues while working unless Ctrl+Enter flips it', async () => {
  const calls: Array<{ id: string; mode: DeliverMode; text: string }> = []
  const runner = {
    async deliver(_session: string, requestId: string, text: string, mode: DeliverMode) {
      calls.push({ id: requestId, mode, text })
    },
  }
  expect(await deliverWorkingSend(runner, 's', 'r1', 'oi', false, 'queue', false)).toBe('steer')
  expect(await deliverWorkingSend(runner, 's', 'r2', 'fila', true, 'queue', false)).toBe('queue')
  expect(await deliverWorkingSend(runner, 's', 'r3', 'agora', true, 'queue', true)).toBe('steer')
  await flushWorkingQueue(runner, 's', [{
    id: 'q1', personaId: 'nina', subjectId: 'sub', text: 'depois', createdAt: '2026-11-04T03:40:00.000Z',
  }])
  expect(calls.map(row => row.mode)).toEqual(['steer', 'queue', 'steer', 'queue'])
  expect(calls[3]?.text).toBe('depois')
})

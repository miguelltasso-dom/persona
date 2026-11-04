import { expect, it } from 'vitest'
import { activityFromReport, batchRouterBurst, foldTurnActivity } from '../src/index.ts'

it('maps reports to honest activity and batches a Router burst per thread', () => {
  const events = [
    activityFromReport({
      id: '1', personaId: 'nina', threadId: 'geral', title: 'npm test',
      at: '2026-11-04T04:40:00.000Z', tool: 'command', state: 'ready',
    }),
    activityFromReport({
      id: '2', personaId: 'nina', threadId: 'geral', title: 'patch',
      at: '2026-11-04T04:40:01.000Z', tool: 'file', state: 'failed',
    }),
    activityFromReport({
      id: '3', personaId: 'nina', threadId: 'geral', title: 'Sol',
      at: '2026-11-04T04:40:02.000Z', tool: 'message', state: 'waiting',
    }),
  ]
  const fold = foldTurnActivity(events)
  expect(fold[0]?.doneByKind.command).toBe(1)
  expect(fold[0]?.failedCount).toBe(1)
  expect(fold[0]?.unfinished).toBe(true)
  expect(batchRouterBurst([
    { id: 'a', threadId: 't1' },
    { id: 'b', threadId: 't1' },
    { id: 'c', threadId: 't2' },
  ])).toEqual([
    { threadId: 't1', ids: ['a', 'b'] },
    { threadId: 't2', ids: ['c'] },
  ])
})

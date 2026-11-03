import { expect, it } from 'vitest'
import { kanbanColumn, projectKanban, reviewThread, ticketStage } from '../src/index.ts'
import type { Ticket } from '../src/index.ts'

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 't1',
  title: 'x',
  decisionId: 'd',
  mandate: {
    strength: 'explicit',
    policyVersion: 'v',
    basis: { via: 'listed' },
    actor: { source: 'channel', id: 'ana' },
    scope: '',
  },
  channels: [],
  assignments: [{ id: 'a', state: 'running', createdAt: '' }],
  inputs: [],
  undelivered: [],
  createdAt: '',
  updatedAt: '',
  origin: { triggerId: 'x', triggerIds: ['x'] },
  ...overrides,
})

const reported = (state: 'ready' | 'blocked' | 'failed' | 'waiting'): Ticket => ticket({
  assignments: [{
    id: 'a',
    state: 'running',
    createdAt: '',
    report: { state, summary: '', at: 'earlier' },
  }],
})

it('projects ticket stages onto kanban columns and waiting chip', () => {
  expect(kanbanColumn({ stage: 'working', action: 'queued' })).toEqual({ column: 'todo' })
  expect(kanbanColumn({ stage: 'working' })).toEqual({ column: 'doing' })
  expect(kanbanColumn({ stage: 'person', action: 'review' })).toEqual({ column: 'review' })
  expect(kanbanColumn({ stage: 'person', action: 'blocked' })).toEqual({ column: 'blocked' })
  expect(kanbanColumn({ stage: 'person', action: 'answer' })).toEqual({ column: 'blocked' })
  expect(kanbanColumn({ stage: 'person', action: 'failed' })).toEqual({ column: 'blocked' })
  expect(kanbanColumn({ stage: 'person', action: 'delivery' })).toEqual({ column: 'blocked' })
  expect(kanbanColumn({ stage: 'idle' })).toEqual({ column: 'doing', chip: 'waiting' })
  expect(kanbanColumn({ stage: 'ended' })).toEqual({ column: 'done' })
})

it('builds a review thread only for person/review (D-039)', () => {
  const ready = reported('ready')
  expect(ticketStage(ready)).toEqual({ stage: 'person', action: 'review' })
  expect(reviewThread(ready)).toEqual({ source: 'review', id: 't1' })
  expect(reviewThread(ticket())).toBeUndefined()
  expect(projectKanban(ready)).toMatchObject({ ticketId: 't1', column: 'review' })
})

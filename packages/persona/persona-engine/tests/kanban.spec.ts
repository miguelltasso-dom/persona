import { expect, it } from 'vitest'
import {
  kanbanColumn,
  legacyColumnLabelToCategory,
  legacyKanbanToCategory,
  projectKanban,
  reviewThread,
  stageCategory,
  ticketStage,
} from '../src/index.ts'
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

it('maps the mixed-board column onto a Quadros category (PB-10)', () => {
  expect(legacyKanbanToCategory('todo')).toBe('todo')
  expect(legacyKanbanToCategory('doing')).toBe('doing')
  expect(legacyKanbanToCategory('review')).toBe('review')
  expect(legacyKanbanToCategory('blocked')).toBe('needs_you')
  expect(legacyKanbanToCategory('done')).toBe('done')
  expect(legacyColumnLabelToCategory('A fazer')).toBe('todo')
  expect(legacyColumnLabelToCategory('Em andamento')).toBe('doing')
  expect(legacyColumnLabelToCategory('Revisar')).toBe('review')
  expect(legacyColumnLabelToCategory('Precisa de você')).toBe('needs_you')
  expect(legacyColumnLabelToCategory('Bloqueado')).toBe('needs_you')
  expect(legacyColumnLabelToCategory('Concluído')).toBe('done')
  expect(legacyColumnLabelToCategory('outra')).toBeUndefined()
  expect(legacyKanbanToCategory(kanbanColumn({ stage: 'person', action: 'blocked' }).column))
    .toBe(stageCategory({ stage: 'person', action: 'blocked' }))
  expect(legacyKanbanToCategory(kanbanColumn({ stage: 'person', action: 'review' }).column))
    .toBe(stageCategory({ stage: 'person', action: 'review' }))
})

it('builds a review thread only for person/review (D-039)', () => {
  const ready = reported('ready')
  expect(ticketStage(ready)).toEqual({ stage: 'person', action: 'review' })
  expect(reviewThread(ready)).toEqual({ source: 'review', id: 't1' })
  expect(reviewThread(ticket())).toBeUndefined()
  expect(projectKanban(ready)).toMatchObject({ ticketId: 't1', column: 'review' })
})

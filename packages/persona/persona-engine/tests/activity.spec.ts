import { expect, it } from 'vitest'
import {
  Engine,
  MemoryRepositories,
  activityFromDomainEvent,
  activityFromReport,
  batchRouterBurst,
  foldTurnActivity,
  foldTurnActivityBook,
  recordTurnActivity,
  withTurnActivityEmit,
  type DomainEvent,
  type Ticket,
} from '../src/index.ts'

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
  const book = foldTurnActivityBook(events)
  expect(book.successRate).toBe(0.5)
  expect(foldTurnActivityBook([]).successRate).toBeNull()
  expect(batchRouterBurst([
    { id: 'a', threadId: 't1' },
    { id: 'b', threadId: 't1' },
    { id: 'c', threadId: 't2' },
  ])).toEqual([
    { threadId: 't1', ids: ['a', 'b'] },
    { threadId: 't2', ids: ['c'] },
  ])
  const recorded = recordTurnActivity({
    id: '4', personaId: 'nina', threadId: 'geral', title: 'npm test',
    at: '2026-11-04T04:40:03.000Z', tool: 'command', state: 'ready',
  })
  expect(recorded.kind).toBe('command')
  expect(recorded.status).toBe('done')
})

it('Engine.report emits assignment.reported and maps a non-empty fold', () => {
  const seen: DomainEvent[] = []
  const ticket: Ticket = {
    id: 't1',
    title: 'npm test',
    decisionId: 'd1',
    mandate: {
      strength: 'explicit',
      policyVersion: 'v1',
      basis: { via: 'listed' },
      actor: { source: 'chat', id: 'nina' },
      scope: 'small',
    },
    channels: [{ source: 'chat', thread: 'geral', address: { message: 'm1' } }],
    assignments: [{ id: 'a1', state: 'running', createdAt: '2026-11-04T06:00:00.000Z', startedAt: '2026-11-04T06:00:00.000Z' }],
    inputs: [],
    undelivered: [],
    createdAt: '2026-11-04T06:00:00.000Z',
    updatedAt: '2026-11-04T06:00:00.000Z',
    origin: { triggerId: 'm1', triggerIds: ['m1'] },
  }
  const repo = new MemoryRepositories()
  repo.tickets.save(ticket)
  const engine = new Engine({
    repo,
    policy: () => ({
      version: 'v1',
      paused: false,
      evalTimeoutMs: 60_000,
      gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
      revalidate: () => true,
      admitsInferred: () => true,
    }),
    scope: { scope: () => ({ listened: true, observed: false }) },
    assessor: { request: () => {}, release: () => {} },
    executor: { start: () => {}, deliver: () => {}, stop: () => {} },
    outbox: { send: () => {}, status: () => undefined, withdraw: () => {} },
    now: () => '2026-11-04T06:10:00.000Z',
    emit: (event) => { seen.push(event) },
  })
  engine.report('t1', { state: 'progress', summary: 'npm test' })
  const reported = seen.find(event => event.type === 'assignment.reported')
  expect(reported?.type).toBe('assignment.reported')
  const row = activityFromDomainEvent(reported!)
  expect(row).toEqual({
    id: 't1:a1:2026-11-04T06:10:00.000Z',
    personaId: 'nina',
    threadId: 'geral',
    kind: 'command',
    title: 'npm test',
    status: 'running',
    at: '2026-11-04T06:10:00.000Z',
  })
  expect(foldTurnActivity(row === undefined ? [] : [row])).toHaveLength(1)
  expect(activityFromDomainEvent({ type: 'assignment.started', at: '2026-11-04T06:10:00.000Z', data: { ticketId: 't1', assignmentId: 'a1' } })).toBeUndefined()
  const persisted: string[] = []
  const forwarded: string[] = []
  const emit = withTurnActivityEmit((row) => { persisted.push(row.id) }, (event) => { forwarded.push(event.type) })
  emit(reported!)
  emit({ type: 'assignment.started', at: '2026-11-04T06:10:00.000Z', data: { ticketId: 't1', assignmentId: 'a1' } })
  expect(persisted).toEqual(['t1:a1:2026-11-04T06:10:00.000Z'])
  expect(forwarded).toEqual(['assignment.reported', 'assignment.started'])
})

import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { BACKGROUND_AFTER_MS, BackgroundWork, backgroundWorkOf } from '../src/background-work.ts'
import type PersonaHost from '../src/index.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile('2026-11-03T15:00:00.000Z')
const scope = { workspaceId: 'ws', projectId: 'pp' }

const NOW = Date.parse('2026-11-11T22:00:00.000Z')

function delay(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<undefined>()
  setTimeout(() => { resolve(undefined) }, ms)
  return promise
}

it('the clock is 4 minutes from the turn start, and 20 tool calls detach at once', () => {
  const book = new BackgroundWork({ nowMs: () => NOW })
  expect(book.remainingMs(new Date(NOW - 3 * 60_000).toISOString(), 0)).toBe(60_000)
  expect(book.remainingMs(new Date(NOW - 5 * 60_000).toISOString(), 0)).toBe(0)
  expect(book.remainingMs(undefined, 0)).toBe(BACKGROUND_AFTER_MS)
  expect(book.remainingMs(new Date(NOW - 10_000).toISOString(), 20)).toBe(0)
})

it('a Task that passes the threshold frees the caller and keeps running in the background', async () => {
  const detached: string[] = []
  const book = new BackgroundWork({ afterMs: 20, onDetach: (id) => { detached.push(id) } })
  const { promise: task, resolve: finish } = Promise.withResolvers<undefined>()
  const run = book.run('t1', task.then(() => undefined))
  await delay(50)
  expect(detached).toEqual(['t1'])
  expect(book.isBackground('t1')).toBe(true)
  expect(book.size()).toBe(1)
  await run // the work chain is free even though the Task is still running
  finish(undefined)
  await book.whenIdle()
  expect(book.isBackground('t1')).toBe(false)
  expect(book.size()).toBe(0)
})

it('a Task that ends before the threshold never goes to the background', async () => {
  const detached: string[] = []
  const book = new BackgroundWork({ afterMs: 60_000, onDetach: (id) => { detached.push(id) } })
  const { promise: task, resolve: finish } = Promise.withResolvers<undefined>()
  const run = book.run('t1', task.then(() => undefined))
  finish(undefined)
  await run
  expect(detached).toEqual([])
  expect(book.isBackground('t1')).toBe(false)
  expect(book.size()).toBe(0)
})

it('a Task already in the background is not detached twice, and a second run is tracked', async () => {
  const detached: string[] = []
  const book = new BackgroundWork({ afterMs: 0, onDetach: (id) => { detached.push(id) } })
  const { promise: first, resolve: finishFirst } = Promise.withResolvers<undefined>()
  await book.run('t1', first.then(() => undefined))
  expect(detached).toEqual(['t1'])
  const { promise: second, resolve: finishSecond } = Promise.withResolvers<undefined>()
  await book.run('t1', second.then(() => undefined))
  expect(detached).toEqual(['t1'])
  expect(book.size()).toBe(1)
  finishFirst(undefined)
  finishSecond(undefined)
  await book.whenIdle()
  expect(book.size()).toBe(0)
})

it('each host has one book', () => {
  const host = {}
  const other = {}
  expect(backgroundWorkOf(host)).toBe(backgroundWorkOf(host))
  expect(backgroundWorkOf(host)).not.toBe(backgroundWorkOf(other))
})


/** A running Task of Bento, in the general channel, with a task runner that reports it as running. */
function openTicket(h: PersonaHost): Ticket {
  const at = '2026-11-03T14:00:00.000Z'
  const ticket: Ticket = {
    id: 't1', title: 'Relatório do dia', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 't1-a1', state: 'running', createdAt: at, startedAt: at }], inputs: [], undelivered: [],
    createdAt: at, updatedAt: at, origin: { triggerId: 'm-old', triggerIds: ['m-old'] },
    execution: { name: 'Bento', directory: '.', assignment: 'Faça o relatório do dia' },
  }
  h.orchestration.runtime('pp').repo.tickets.save(ticket)
  h.orchestration.warmRunners.set('pp:p1:task', {
    ensureSession: () => Promise.resolve(),
    deliver: () => Promise.resolve(),
    cancel: () => Promise.resolve(),
    status: () => 'running',
    whenIdle: () => Promise.resolve(),
    onEvent: () => () => undefined,
    capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
  })
  return ticket
}

it('a Task in the background does not absorb the person\'s new message; it becomes a talk turn', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
  openTicket(h)
  const book = backgroundWorkOf(h.orchestration)
  const { promise: task, resolve: finish } = Promise.withResolvers<undefined>()
  await book.run('t1', task.then(() => undefined), '2026-11-03T13:00:00.000Z')
  expect(book.isBackground('t1')).toBe(true)
  h.postMessage({ id: 'm-new', ...scope, streamKind: 'channel', ownerId: 'geral', body: '@Bento Oi, tudo bem?', actorId: 'ana', subjectId: '' })
  await h.orchestration.flush('pp')
  const messages = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events
  expect(messages.some(message => message.body.includes('Passei para Bento'))).toBe(false)
  expect(messages.some(message => message.actorId === 'p1')).toBe(true)
  finish(undefined)
  await book.whenIdle()
})


it('driveTicket frees the work chain at 4 minutes and posts the promise line', async () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    id: 'p1', workspaceId: 'ws', projectId: 'pp', name: 'Bento', title: 'Engenharia', description: 'Implementa.',
    personality: 'Direto.', instructions: 'Prove.', avatarKind: 'gallery', avatarRef: 'bento',
    runnerKind: 'dsh', runnerCli: '', runnerModel: 'm', canRecruit: false, createdBy: 'ana',
  })
  h.sessionMemberId = 'ana'
  const ticket = openTicket(h)
  ticket.assignments[0]!.startedAt = '2026-11-03T13:00:00.000Z' // more than 4 minutes before the harness clock
  h.orchestration.runtime('pp').repo.tickets.save(ticket)
  const { promise: gate, resolve: open } = Promise.withResolvers<boolean>()
  h.orchestration.warmRunners.set('pp:p1:task', {
    ensureSession: () => Promise.resolve(),
    deliver: () => Promise.resolve(),
    cancel: () => Promise.resolve(),
    status: () => 'running',
    whenIdle: async () => { await gate },
    onEvent: () => () => undefined,
    capabilities: () => ({ steer: true, removeQueued: true, reportsInputTaken: true, background: false, tools: 'native', resume: true }),
  })
  const run = h.orchestration.driveTicket('pp', 't1')
  await h.orchestration.flush('pp') // the chain is free even though the Task is still held
  expect(backgroundWorkOf(h.orchestration).isBackground('t1')).toBe(true)
  const messages = h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 100 }).events
  expect(messages.some(message => message.body === 'Sigo no fundo; te aviso quando terminar.')).toBe(true)
  open(true)
  await run
  expect(backgroundWorkOf(h.orchestration).isBackground('t1')).toBe(false)
})

it('the 20th tool call of the open turn moves the Task to the background long before the 4 minutes; calls of a Task the book does not track count for nothing', async () => {
  const detached: string[] = []
  const book = new BackgroundWork({ afterMs: 60_000, afterToolCalls: 20, onDetach: (id) => { detached.push(id) } })
  const { promise: task, resolve: finish } = Promise.withResolvers<undefined>()
  book.toolCalled('ghost') // nobody runs it: nothing is kept
  const run = book.run('t1', task.then(() => undefined))
  for (let call = 0; call < 19; call += 1) book.toolCalled('t1')
  expect(book.isBackground('t1')).toBe(false)
  book.toolCalled('t1')
  await run // the chain is free, the Task is still open
  expect(book.isBackground('t1')).toBe(true)
  expect(detached).toEqual(['t1'])
  book.toolCalled('t1') // after the detach nothing changes (the line is said once)
  expect(detached).toEqual(['t1'])
  finish(undefined)
  await book.whenIdle()
  expect(book.isBackground('t1')).toBe(false)
})

it('a restarted run of the same Task counts from the calls it brings, not from the old turn', async () => {
  const book = new BackgroundWork({ afterMs: 60_000, afterToolCalls: 20 })
  const { promise: first, resolve: end } = Promise.withResolvers<undefined>()
  void book.run('t2', first.then(() => undefined))
  for (let call = 0; call < 15; call += 1) book.toolCalled('t2')
  end(undefined)
  await book.whenIdle()
  const { promise: second, resolve: endSecond } = Promise.withResolvers<undefined>()
  void book.run('t2', second.then(() => undefined))
  for (let call = 0; call < 10; call += 1) book.toolCalled('t2')
  expect(book.isBackground('t2')).toBe(false) // 15 + 10 would have detached it
  endSecond(undefined)
  await book.whenIdle()
})

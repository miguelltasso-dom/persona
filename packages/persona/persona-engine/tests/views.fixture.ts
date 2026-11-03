import { MemoryRepositories, threadKey } from '../src/index.ts'
import type { Decision, Mandate, Thread, Ticket, Trigger, ViewHost } from '../src/index.ts'

export const PROJECT = 'launch'

export function mandate(overrides: Partial<Mandate> = {}): Mandate {
  return {
    strength: 'explicit',
    policyVersion: 'v1',
    basis: { via: 'listed' },
    actor: { source: 'chat', id: 'alice' },
    scope: 'small',
    ...overrides,
  }
}

export function ticket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    title: `Tarefa ${id}`,
    decisionId: `d-${id}`,
    mandate: mandate(),
    channels: [{ source: 'chat', thread: 't1', address: { message: id } }],
    assignments: [],
    inputs: [],
    undelivered: [],
    createdAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
    origin: { triggerId: 'tr1', triggerIds: ['tr1'] },
    ...overrides,
  }
}

export function thread(id: string, overrides: Partial<Thread> = {}): Thread {
  const ref = { source: 'chat', id }
  return {
    key: threadKey(ref),
    ref,
    createdAt: '2026-11-03T11:00:00.000Z',
    subscriptions: [],
    correlated: [],
    pending: [],
    meta: {},
    ...overrides,
  }
}

export function trigger(id: string, overrides: Partial<Trigger> = {}): Trigger {
  return {
    id,
    source: 'chat',
    threads: [{ source: 'chat', id: 't1' }],
    actor: { source: 'chat', id: 'alice' },
    human: true,
    at: `2026-11-03T12:00:${String(id.replace(/\D/g, '') || '0').padStart(2, '0')}.000Z`,
    text: `mensagem ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } },
    meta: {},
    ...overrides,
  }
}

export function decision(id: string, overrides: Partial<Decision> = {}): Decision {
  return {
    id,
    evalId: `e-${id}`,
    threadKey: 'chat:t1',
    triggerIds: ['tr1'],
    policyVersion: 'v1',
    at: '2026-11-03T12:01:00.000Z',
    kind: 'accept',
    reason: [{ code: 'said', values: { text: 'pedido' } }],
    strength: 'explicit',
    ...overrides,
  }
}

export function host(repo: MemoryRepositories, canRead: (id: string) => boolean = () => true): ViewHost {
  return {
    repo,
    projectId: repo.projectId,
    now: () => '2026-11-03T15:00:00.000Z',
    load: { running: 0, queued: 0, maxWorkers: 4 },
    canReadTicket: ticketRow => canRead(ticketRow.id),
    canReadThread: key => canRead(key),
  }
}

export function filledRepo(): MemoryRepositories {
  const repo = new MemoryRepositories(PROJECT)
  repo.triggers.save(trigger('tr1', { text: 'abra o PR' }))
  repo.triggers.save(trigger('tr2', { text: 'e depois o teste', at: '2026-11-03T12:00:10.000Z' }))
  repo.threads.save(thread('t1', {
    subscriptions: ['need'],
    pending: ['tr2'],
    lastAt: '2026-11-03T12:00:10.000Z',
  }))
  repo.tickets.save(ticket('need', {
    title: 'Revisar PR',
    attention: { id: 'q1', question: 'Qual branch?' },
    updatedAt: '2026-11-03T13:00:00.000Z',
  }))
  repo.tickets.save(ticket('work', {
    title: 'Implementar',
    assignments: [{ id: 'a1', state: 'running', createdAt: '2026-11-03T12:10:00.000Z', startedAt: '2026-11-03T12:10:00.000Z' }],
    updatedAt: '2026-11-03T12:10:00.000Z',
  }))
  repo.tickets.save(ticket('wait', {
    title: 'Esperando CI',
    assignments: [{
      id: 'a2', state: 'ended', createdAt: '2026-11-03T12:20:00.000Z',
      endedAt: '2026-11-03T12:21:00.000Z',
      report: { state: 'waiting', summary: 'CI', at: '2026-11-03T12:21:00.000Z' },
    }],
    updatedAt: '2026-11-03T12:21:00.000Z',
  }))
  repo.tickets.save(ticket('done', {
    title: 'Pronto',
    ended: { at: '2026-11-03T14:00:00.000Z', by: 'executor', outcome: 'completed' },
    updatedAt: '2026-11-03T14:00:00.000Z',
  }))
  repo.tickets.save(ticket('hidden', {
    title: 'Segredo',
    origin: { triggerId: 'tr-hidden', triggerIds: ['tr-hidden'] },
    updatedAt: '2026-11-03T14:30:00.000Z',
  }))
  repo.decisions.save(decision('d-need', { ticketId: 'need' }))
  return repo
}

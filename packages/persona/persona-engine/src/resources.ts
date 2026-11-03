/**
 * `persona_read` / `persona_recall` over Repositories.
 * Worker sessions may only read what their Ticket reached (the security frontier).
 * Spill ids use the same `persona-spill:` prefix as core `spillPointer` (B4).
 */

import {
  UserError, latestReport, reached, threadKey,
  type Repositories, type Thread, type Ticket, type Trigger,
} from './core/index.ts'
import {
  ASSIGNMENTS, INPUTS, assignmentLine, decisionCard, decisionDetails, inputLine, newestPage,
  textPage, threadCard, ticketCard, ticketDetails, triggerCard,
} from './cards.ts'
import { knownTriggers } from './views/host.ts'

export const RESOURCES: readonly { name: string; holds: string; executor?: true }[] = [
  { name: 'tickets', holds: 'cartões de tarefa, mais novos primeiro' },
  { name: 'triggers', holds: 'cartões de trigger com o destino de cada um' },
  { name: 'threads', holds: 'assuntos seguidos, atividade mais recente primeiro' },
  { name: 'thread/<key>', holds: 'um assunto: tickets e triggers', executor: true },
  { name: 'decisions', holds: 'decisões, mais novas primeiro' },
  { name: 'decision/<id>', holds: 'uma decisão com auditoria' },
  { name: 'ticket/<id>', holds: 'cartão, mandate, assignments e inputs', executor: true },
  { name: 'ticket/<id>/assignment', holds: 'texto da assignment', executor: true },
  { name: 'ticket/<id>/assignments', holds: 'assignments, mais novas primeiro', executor: true },
  { name: 'ticket/<id>/inputs', holds: 'inputs, mais novos primeiro', executor: true },
  { name: 'ticket/<id>/result', holds: 'último report', executor: true },
  { name: 'ticket/<id>/report/<id>', holds: 'report de uma assignment', executor: true },
  { name: 'ticket/<id>/input/<id>', holds: 'um input entregue', executor: true },
  { name: 'trigger/<id>', holds: 'texto do trigger e para onde foi', executor: true },
]

const SPILL_PREFIX = 'persona-spill:'

/**
 * @param id - Object id whose body spilled.
 */
export function resourceSpillPointer(id: string): string {
  return `${SPILL_PREFIX}${id}`
}

/**
 * @param pointer - Value from {@link resourceSpillPointer} or core `spillPointer`.
 */
export function resourceSpillId(pointer: string): string | undefined {
  return pointer.startsWith(SPILL_PREFIX) ? pointer.slice(SPILL_PREFIX.length) : undefined
}

/**
 * @param executor - Worker session.
 */
export function resourceGrammar(executor: boolean): string {
  return RESOURCES.filter(resource => !executor || resource.executor)
    .map(resource => `${resource.name}: ${resource.holds}`).join('; ')
}

export interface SpillNode {
  id: string
  summary: string
  body: string
  neighborIds: readonly string[]
}

export interface RecallHop {
  id: string
  summary: string
  body: string
  neighbors: string[]
}

export interface ResourceHost {
  repo: Repositories
  /**
   * @param id - Spill / recall object id.
   */
  loadSpill?: (id: string) => SpillNode | undefined
}

/**
 * Whether a worker ticket may read a trigger (origin, input, subscription, follow).
 * @param ticket - Worker ticket.
 * @param trigger - Candidate trigger.
 * @param thread - Thread lookup.
 */
export function readable(
  ticket: Ticket,
  trigger: Trigger,
  thread: (key: string) => Thread | undefined,
): boolean {
  return reached(ticket, trigger, thread)
    || ticket.origin.triggerIds.includes(trigger.id)
    || trigger.threads.some(ref => ticket.follows?.some(follow => follow.thread === threadKey(ref)))
}

function workerOf(host: ResourceHost, ticketId: string | undefined): Ticket | undefined {
  if (ticketId === undefined) return undefined
  const ticket = host.repo.tickets.get(ticketId)
  if (ticket === undefined) throw new UserError('unknownTicket')
  return ticket
}

function requireTrigger(host: ResourceHost, id: string, ticket?: Ticket): Trigger {
  const found = host.repo.triggers.get(id)
  if (found === undefined) throw new UserError('unknownTrigger')
  if (ticket !== undefined && !readable(ticket, found, key => host.repo.threads.get(key))) {
    throw new UserError('notReached')
  }
  return found
}

function requireTicket(host: ResourceHost, id: string, worker?: Ticket): Ticket {
  if (worker !== undefined && worker.id !== id) throw new UserError('unknownTicket')
  const ticket = host.repo.tickets.get(id)
  if (ticket === undefined) throw new UserError('unknownTicket')
  return ticket
}

function split(id: string): { head: string; rest: string } {
  const slash = id.indexOf('/')
  return slash < 0 ? { head: id, rest: '' } : { head: id.slice(0, slash), rest: id.slice(slash + 1) }
}

/**
 * Read a resource by id. Worker sessions pass their ticket id.
 * Spill pointers (`persona-spill:…`) go through {@link personaRecall}.
 * @param host - Repositories + optional spill loader.
 * @param id - Resource id (`ticket/…`, `trigger/…`, `persona-spill:…`).
 * @param workerTicketId - Worker ticket, or omit for the coordinator.
 */
export async function personaRead(
  host: ResourceHost,
  id: string,
  workerTicketId?: string,
): Promise<unknown> {
  const spilled = resourceSpillId(id)
  if (spilled !== undefined) return personaRecall(host, spilled, workerTicketId)
  const worker = workerOf(host, workerTicketId)
  const { head, rest } = split(id)
  if (head === 'tickets') {
    if (worker !== undefined) throw new UserError('unknownTicket')
    return { items: host.repo.tickets.list().map(ticketCard) }
  }
  if (head === 'triggers') {
    if (worker !== undefined) throw new UserError('unknownTrigger')
    return { items: knownTriggers(host.repo).map(trigger => triggerCard(trigger, host.repo.triggers.disposition(trigger.id))) }
  }
  if (head === 'threads') {
    if (worker !== undefined) throw new UserError('unknownTicket')
    return {
      items: host.repo.threads.list()
        .filter(thread => thread.subscriptions.length > 0)
        .map(thread => threadCard(thread, thread.key)),
    }
  }
  if (head === 'decisions') {
    if (worker !== undefined) throw new UserError('unknownTicket')
    return {
      items: host.repo.threads.list().flatMap(thread => host.repo.decisions.byThread(thread.key)).map(decisionCard),
    }
  }
  if (head === 'decision') {
    if (worker !== undefined) throw new UserError('unknownTicket')
    const decision = host.repo.decisions.get(rest)
    if (decision === undefined) throw new UserError('unknownProblem')
    return decisionDetails(decision)
  }
  if (head === 'trigger') {
    const trigger = requireTrigger(host, rest, worker)
    return { ...triggerCard(trigger, host.repo.triggers.disposition(trigger.id)), text: trigger.text }
  }
  if (head === 'thread') {
    const thread = host.repo.threads.get(rest)
    const allowed = thread !== undefined && (
      worker === undefined
      || thread.subscriptions.includes(worker.id)
      || worker.follows?.some(follow => follow.thread === rest)
    )
    if (thread === undefined || !allowed) throw new UserError('unknownTicket')
    const card = threadCard(thread, thread.key)
    if (worker !== undefined) return { ...card, tickets: undefined }
    return {
      ...card,
      tickets: thread.subscriptions.flatMap((ticketId) => {
        const ticket = host.repo.tickets.get(ticketId)
        return ticket === undefined ? [] : [ticketCard(ticket)]
      }),
      decisions: host.repo.decisions.byThread(thread.key).slice(-5).reverse().map(decisionCard),
    }
  }
  if (head === 'ticket') {
    const [ticketId, part, extra] = rest.split('/')
    if (ticketId === undefined || ticketId === '') throw new UserError('unknownTicket')
    const ticket = requireTicket(host, ticketId, worker)
    if (part === undefined || part === '') {
      const threads = host.repo.threads.list()
        .filter(thread => thread.subscriptions.includes(ticket.id) || ticket.follows?.some(follow => follow.thread === thread.key))
        .map((thread) => {
          const item: { thread: string; context?: true } = { thread: thread.key }
          if (thread.context?.includes(ticket.id)) item.context = true
          return item
        })
      return ticketDetails(ticket, threads, worker !== undefined)
    }
    if (part === 'assignment') return textPage(id, ticket.execution?.assignment ?? '', 0, 4000)
    if (part === 'result') {
      const report = latestReport(ticket)
      return report === undefined ? { empty: true } : { state: report.state, at: report.at, summary: report.summary }
    }
    if (part === 'assignments') {
      return newestPage(ticket.assignments, 0, ASSIGNMENTS, item => assignmentLine(ticket, item), `ticket/${ticket.id}/assignments`)
    }
    if (part === 'inputs') {
      return newestPage(ticket.inputs, 0, INPUTS, input => inputLine(ticket, input, worker !== undefined), `ticket/${ticket.id}/inputs`)
    }
    if (part === 'report' && extra !== undefined) {
      const assignment = ticket.assignments.find(item => item.id === extra)
      if (assignment?.report === undefined) throw new UserError('unknownAssignment')
      return { state: assignment.report.state, at: assignment.report.at, summary: assignment.report.summary }
    }
    if (part === 'input' && extra !== undefined) {
      const input = ticket.inputs.find(item => item.id === extra)
      if (input === undefined) throw new UserError('unknownAssignment')
      return inputLine(ticket, input, worker !== undefined)
    }
    throw new UserError('unknownTicket')
  }
  throw new UserError('unknownTicket')
}

/**
 * Chain of Recall. Authorization is re-checked at every hop and scoped to the worker ticket when set.
 * @param host - Host with spill loader.
 * @param id - Start id (bare or `persona-spill:`).
 * @param workerTicketId - Worker ticket, or omit for the coordinator.
 */
export async function personaRecall(
  host: ResourceHost,
  id: string,
  workerTicketId?: string,
): Promise<RecallHop[]> {
  const startId = resourceSpillId(id) ?? id
  const worker = workerOf(host, workerTicketId)
  const load = host.loadSpill
  if (load === undefined) throw new UserError('unknownTrigger')
  const hops: RecallHop[] = []
  const seen = new Set<string>()
  const queue = [startId]
  while (queue.length > 0 && hops.length < 8) {
    const next = queue.shift()
    if (next === undefined || seen.has(next)) continue
    seen.add(next)
    const node = load(next)
    if (node === undefined) {
      if (hops.length === 0) throw new UserError('unknownTrigger')
      break
    }
    const allowed = worker === undefined
      || node.id.startsWith(`ticket/${worker.id}`)
      || node.id === startId
      || await triggerHopAllowed(host, worker, node.id)
    if (!allowed) {
      if (hops.length === 0) throw new UserError('notReached')
      break
    }
    hops.push({ id: node.id, summary: node.summary, body: node.body, neighbors: [...node.neighborIds] })
    for (const neighbor of node.neighborIds) {
      if (!seen.has(neighbor)) queue.push(neighbor)
    }
  }
  return hops
}

async function triggerHopAllowed(host: ResourceHost, worker: Ticket, id: string): Promise<boolean> {
  if (!id.startsWith('trigger/')) return false
  const trigger = host.repo.triggers.get(id.slice('trigger/'.length))
  if (trigger === undefined) return false
  return readable(worker, trigger, key => host.repo.threads.get(key))
}

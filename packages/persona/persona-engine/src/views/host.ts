/**
 * View host: Repositories + project + ACL hook. Anvil binds `can()` here.
 */

import type { Repositories } from '../core/ports.ts'
import type { Decision, Ticket, Trigger } from '../core/model.ts'
import { threadKey } from '../core/model.ts'

export interface ExecutorLoad {
  running: number
  queued: number
  maxWorkers: number
}

/**
 * What the UI views may read. `canReadTicket` is `can(actor, 'read', ticket)`.
 */
export interface ViewHost {
  repo: Repositories
  projectId: string
  now: () => string
  load: ExecutorLoad
  /**
   * @param ticket - Ticket under consideration.
   */
  canReadTicket: (ticket: Ticket) => boolean
  /**
   * @param threadKey - Thread key (`source:id`).
   */
  canReadThread: (threadKey: string) => boolean
  /**
   * Timeline turns. Default walks known triggers on the thread.
   * @param threadKey - Thread key.
   */
  turns?: (threadKey: string) => { at: string; id: string; role: string; text: string }[]
}

/**
 * @param item - Ticket, thread, or decision.
 */
export function stamp(item: { updatedAt?: string; lastAt?: string; createdAt?: string; at?: string }): string {
  return item.updatedAt ?? item.lastAt ?? item.createdAt ?? item.at ?? ''
}

export const newestFirst = (a: { updatedAt?: string; lastAt?: string; createdAt?: string; at?: string }, b: typeof a): number =>
  stamp(b).localeCompare(stamp(a))

/**
 * Decisions have no `list()` on the port; walk threads.
 * @param repo - Repositories.
 */
export function listDecisions(repo: Repositories): Decision[] {
  const seen = new Set<string>()
  const out: Decision[] = []
  for (const thread of repo.threads.list()) {
    for (const decision of repo.decisions.byThread(thread.key)) {
      if (seen.has(decision.id)) continue
      seen.add(decision.id)
      out.push(decision)
    }
  }
  return out
}

/**
 * Triggers the port can reach without `list()`: pending, evaluating, ticket origins/inputs.
 * @param repo - Repositories.
 */
export function knownTriggers(repo: Repositories): Trigger[] {
  const ids = new Set<string>()
  for (const thread of repo.threads.list()) {
    for (const id of thread.pending) ids.add(id)
    for (const id of thread.evaluating?.triggerIds ?? []) ids.add(id)
  }
  for (const ticket of repo.tickets.list()) {
    for (const id of ticket.origin.triggerIds) ids.add(id)
    for (const input of ticket.inputs) {
      if (input.kind === 'trigger' || input.kind === 'resumed') ids.add(input.triggerId)
    }
  }
  return [...ids].flatMap((id) => {
    const trigger = repo.triggers.get(id)
    return trigger === undefined ? [] : [trigger]
  })
}

/**
 * @param repo - Repositories.
 * @param key - Thread key.
 */
export function turnsFromRepo(repo: Repositories, key: string): { at: string; id: string; role: string; text: string }[] {
  return knownTriggers(repo)
    .filter(trigger => trigger.threads.some(ref => threadKey(ref) === key))
    .map(trigger => ({
      at: trigger.at,
      id: trigger.id,
      role: trigger.human ? 'person' : 'bot',
      text: trigger.text,
    }))
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

/**
 * @param items - Full list.
 * @param offset - Skip.
 * @param limit - Page size.
 */
export function page<T>(items: readonly T[], offset: number, limit: number): {
  items: T[]
  total: number
  next_offset: number | null
} {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    next_offset: offset + limit < items.length ? offset + limit : null,
  }
}

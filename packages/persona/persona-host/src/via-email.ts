/**
 * Colheita S1 P0-03b: whether SOMEONE ELSE's text is anywhere behind a Task. A received e-mail (or an event of a connected source) is written by a
 * third party, so a Task it started never pre-allows `send` ("não perguntar de novo" does not apply: the person's card decides every send).
 *
 * The mark is CONTAGIOUS. Reading only `origin.triggerId` lost it as soon as the work moved on:
 *   - a colleague's Task (`handoff:<asker's Task>:<call>`) is born from the asker's Task, whatever started THAT one;
 *   - a part of a split request (`split:<message>:<persona>`) is made from the message it was split from;
 *   - the Task absorbed more inputs (`inputs`) and its Eval held a batch (`origin.triggerIds`), any of which may be the e-mail.
 * Pure: the host gives it two lookups. Bounded (a chain of Tasks is short; a cycle is cut).
 */

import type { Ticket, Trigger } from '@deepseek-ai/dsh-persona-engine'
import { isEventRunId } from './routine-events.ts'

export interface ViaEmailLookup {
  /** The stored Trigger of an id (an e-mail, a chat message), if any. */
  readonly trigger: (id: string) => Pick<Trigger, 'viaEmail'> | undefined
  /** A Task by id. */
  readonly ticket: (id: string) => Ticket | undefined
  /**
   * Carbon P0-05a: what the Gestor's plan recorded about where it came from (`campaign:<plan>:<n>` opens its Tasks, so the lineage of the message that asked for the plan would be lost). Absent or
   * `undefined` = unknown, which is never "no e-mail".
   */
  readonly campaign?: (planId: string) => { readonly viaEmail?: boolean } | undefined
}

/** The longest chain of Tasks it walks (a handoff of a handoff of…); beyond it the answer is "yes": an unreadable history is not a safe one. */
const MAX_DEPTH = 16

/**
 * @param ticket - The Task about to run.
 * @param lookup - Triggers and Tasks of the project.
 * @returns true when an e-mail (or an event a routine listens to) is anywhere in the Task's ancestry.
 */
export function cameByEmail(ticket: Ticket, lookup: ViaEmailLookup): boolean {
  const seen = new Set<string>()
  const walk = (row: Ticket, depth: number): boolean => {
    if (seen.has(row.id)) return false
    if (depth > MAX_DEPTH) return true
    seen.add(row.id)
    const ids = [row.origin.triggerId, ...row.origin.triggerIds, ...row.inputs.flatMap(input => (input.kind === 'trigger' ? [input.triggerId] : []))]
    for (const id of ids) {
      if (lookup.trigger(id)?.viaEmail === true || isEventRunId(id)) return true
      // A campaign part: only a lineage that says "not from an e-mail" clears it; an unknown one (nothing recorded, the plan gone) is marked.
      const plan = /^campaign:(.+):\d+$/u.exec(id)?.[1]
      if (plan !== undefined && lookup.campaign?.(plan)?.viaEmail !== false) return true
      // A part of a split request is made from the message it was split from.
      const message = /^split:(.+):[^:]+$/u.exec(id)?.[1]
      if (message !== undefined && (lookup.trigger(message)?.viaEmail === true || isEventRunId(message))) return true
      // A colleague's Task is born from the Task that asked for it.
      const asker = /^handoff:([^:]+):/u.exec(id)?.[1]
      if (asker !== undefined) {
        const parent = lookup.ticket(asker)
        if (parent === undefined || walk(parent, depth + 1)) return true // a Task whose asker is gone has an unreadable history: it is not "no e-mail"
      }
    }
    return false
  }
  return walk(ticket, 0)
}

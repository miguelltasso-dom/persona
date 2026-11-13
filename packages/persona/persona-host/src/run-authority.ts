/**
 * Colheita S1 P0-03a: who a run acts for, from where its Task REALLY came. The one authority table (`persona-runners/src/authority/authority-table.ts`) has three rows, and until now every
 * turn armed its gates as `person`, so two of the three were dead code in production: a routine clicked and typed in the persona's Chrome as if the owner were sitting there.
 *
 *  - `person`: somebody wrote the request (a message, a proposal the person accepted, a steer).
 *  - `routine`: a scheduled run (`routine-run:<run>:<attempt>`): nobody is looking at it.
 *  - `unattended`: a run nobody is behind at all: an event a routine listens to (`routine-run:<run>@event:<id>:<attempt>`), the team's own initiative (`initiative:…`) and a plan of the
 *    Coordenação (`plan:…`).
 *
 * The mark is CONTAGIOUS, like `via-email.ts`: a colleague's Task (`handoff:<asker's Task>:<call>`) is born from the asker's Task, a part of a split request (`split:<message>:<persona>`) is made
 * from the message it was split from, and a Task that absorbed more inputs (`inputs`) or whose Eval held a batch (`origin.triggerIds`) is as restricted as the most restricted of them. An
 * unreadable history (a chain too long to walk, a cycle, a colleague's Task whose asker is gone) is never a person.
 * Pure: the host gives it one lookup. Bounded.
 */

import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { AuthorityKind } from '@deepseek-ai/dsh-persona-runners'
import { isEventRunId } from './routine-events.ts'

export interface RunAuthorityLookup {
  /** A Task by id. */
  readonly ticket: (id: string) => Ticket | undefined
  /** Carbon P0-05a: who the Gestor's plan said it acts for (`campaign:<plan>:<n>` opens its Tasks). Absent or `undefined` = unknown = nobody is behind it. */
  readonly campaign?: (planId: string) => { readonly authority?: AuthorityKind } | undefined
  /**
   * MARCO M2: whether the board's lead (the project's responsible persona running the board by herself) DROVE this Task: the durable "lead_pull" document the lead writes BEFORE it hands a card to a
   * persona. A card born from a person's message and pulled by the lead at 2 a.m. is not "a person is here": absent = no autonomous board in this host.
   */
  readonly board?: (ticketId: string) => boolean
}

/** The longest chain of Tasks it walks; beyond it the answer is `unattended`. */
const MAX_DEPTH = 16

const RANK: Readonly<Record<AuthorityKind, number>> = { person: 0, routine: 1, unattended: 2 }
const stricter = (a: AuthorityKind, b: AuthorityKind): AuthorityKind => (RANK[a] >= RANK[b] ? a : b)

/** Triggers a THIRD PARTY (a sender, a webhook, a chat) produced: nobody is behind them (Carbon P0-05a: they used to read as a person, with the owner's logged-in Chrome at their disposal). */
const EXTERNAL_TRIGGER = /^(?:mail|gh|github|telegram|slack|discord|whatsapp|webhook):/u

/** What one trigger id says about who started it. */
function kindOfId(id: string, lookup: RunAuthorityLookup): AuthorityKind {
  if (id.startsWith('routine-run:')) return isEventRunId(id) ? 'unattended' : 'routine'
  if (id.startsWith('initiative:') || id.startsWith('plan:') || id.startsWith('board:') || EXTERNAL_TRIGGER.test(id)) return 'unattended' // "board:<project>:<card>": a Task the board's lead opened
  const campaign = /^campaign:(.+):\d+$/u.exec(id)?.[1]
  if (campaign !== undefined) return lookup.campaign?.(campaign)?.authority ?? 'unattended' // the lineage of the plan, or nobody
  return 'person'
}

/**
 * @param ticket - The Task about to run.
 * @param lookup - Tasks of the project.
 * @returns Who the turn acts for: arm the gates and the runner with it.
 */
export function authorityOfRun(ticket: Ticket, lookup: RunAuthorityLookup): AuthorityKind {
  /** A Task on the path being walked is `walking`; a Task already walked keeps its answer (two paths to the same ancestor are not a cycle). */
  const state = new Map<string, AuthorityKind | 'walking'>()
  const walk = (row: Ticket, depth: number): AuthorityKind => {
    const known = state.get(row.id)
    if (known === 'walking') return 'unattended' // a cycle never reaches a person
    if (known !== undefined) return known
    if (depth > MAX_DEPTH) return 'unattended'
    state.set(row.id, 'walking')
    let result: AuthorityKind = 'person'
    const ids = [row.origin.triggerId, ...row.origin.triggerIds, ...row.inputs.flatMap(input => (input.kind === 'trigger' ? [input.triggerId] : []))]
    for (const id of ids) {
      result = stricter(result, kindOfId(id, lookup))
      // A part of a split request is made from the message it was split from.
      const message = /^split:(.+):[^:]+$/u.exec(id)?.[1]
      if (message !== undefined) result = stricter(result, kindOfId(message, lookup))
      // A colleague's Task is born from the Task that asked for it.
      const asker = /^handoff:([^:]+):/u.exec(id)?.[1]
      if (asker !== undefined) {
        const parent = lookup.ticket(asker)
        result = stricter(result, parent === undefined ? 'unattended' : walk(parent, depth + 1))
      }
    }
    // MARCO M2: a Task the board's lead drove is never "a person is here", whatever the message that created it was; it has no owner waiver either (that is routine's, and nobody set this up).
    if (lookup.board?.(row.id) === true) result = stricter(result, 'unattended')
    state.set(row.id, result)
    return result
  }
  return walk(ticket, 0)
}

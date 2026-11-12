/**
 * What a review teaches the team, kept quietly (harvest item 16, second slice). It used to write a memory every person and persona read —
 * "Revisão aceita: <id do ticket>" — a technical receipt in Memória and in every prompt. Now an accepted delivery is a use of how that persona
 * does that kind of work, and what the owner asks to change is how they like it done: both go to the playbook (playbook.ts), where three accepted
 * deliveries on two different days make one offer in Aprovações ("Bia aprendeu “…” (usado 3×). Virar skill?").
 */

import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type { Orchestration } from './orchestration.ts'
import { notePlaybookAdjustment, notePlaybookWin, type PlaybookResult } from './playbook.ts'
import type { ScreensHost } from './screens.ts'

/** What the host gives the wire. */
export interface FeedbackWireDeps {
  readonly screens: ScreensHost
  readonly product: ProductRepos
  readonly orchestration: Orchestration
}

/** Who did a Task and what it was, from the Task itself (never from its id). */
function taskOf(deps: FeedbackWireDeps, projectId: string, ticketId: string): { personaId: string; personaName: string; title: string; request: string; conversation: string } | undefined {
  const ticket = deps.orchestration.runtime(projectId).repo.tickets.get(ticketId)
  if (ticket === undefined) return undefined
  const persona = deps.product.listPersonas(projectId).find(row => row.name === ticket.execution?.name)
  if (persona === undefined) return undefined
  // The conversation the request came from: its subject (or topic), else the stream. Two conversations count like two days.
  const origin = deps.orchestration.events?.get(ticket.origin.triggerId)
  const conversation = origin === undefined ? '' : (origin.topicId !== undefined && origin.topicId !== '' ? origin.topicId : origin.subjectId !== '' ? origin.subjectId : origin.streamId)
  return { personaId: persona.id, personaName: persona.name, title: ticket.title, request: ticket.execution?.assignment ?? '', conversation }
}

/**
 * The owner applied a delivery: it is a use of how this persona does this kind of work. Failures stay local (a review never fails for this).
 * @param deps - Screens, product and orchestration.
 * @param request - Tenant and Task.
 * @returns What the playbook did, when the Task is known.
 */
export function learnFromAcceptedReview(
  deps: FeedbackWireDeps,
  request: { workspaceId: string; projectId: string; ticketId: string },
): PlaybookResult | undefined {
  try {
    const task = taskOf(deps, request.projectId, request.ticketId)
    if (task === undefined) return undefined
    return notePlaybookWin({ screens: deps.screens, now: () => deps.orchestration.now(), offsetMinutes: iso => deps.orchestration.localOffsetMinutes(iso) }, {
      workspaceId: request.workspaceId, projectId: request.projectId, ticketId: request.ticketId, ...task,
    })
  } catch (error: unknown) {
    void error
    return undefined
  }
}

/**
 * The owner asked for changes: what they asked is how they like this kind of work done. Failures stay local.
 * @param deps - Screens, product and orchestration.
 * @param request - Tenant, Task and what the owner wrote.
 */
export function learnFromRequestedChanges(
  deps: FeedbackWireDeps,
  request: { projectId: string; ticketId: string; feedback: string },
): void {
  try {
    const task = taskOf(deps, request.projectId, request.ticketId)
    if (task === undefined) return
    notePlaybookAdjustment({ screens: deps.screens, now: () => deps.orchestration.now() }, {
      projectId: request.projectId, personaId: task.personaId, title: task.title, feedback: request.feedback,
    })
  } catch (error: unknown) {
    void error
  }
}

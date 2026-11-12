/**
 * Carbon P0-13 (RED 2): a Task BORN in a DM carries the person's words as its title and has a conversation inside that DM. The DM is private to its participants (reading it, searching it,
 * the memory and the "contexto usado" of its messages already respect that), so what is DERIVED from it must too: the board card, the list of Tasks and the context of its turn say
 * "a Task of a private conversation" to whoever is not in the DM, and nothing of what was written there.
 */

import type { Actor } from '@deepseek-ai/dsh-persona-core'
import { sessionCan } from './auth.ts'
import type { ActionPreviewView, ApprovalView } from './types.ts'

/** What a member who is not in the DM reads where the Task's title would be. */
export const PRIVATE_DM_TASK_TITLE = 'Tarefa de uma conversa privada'

/**
 * The part of a Task's teamwork view that carries words written ABOUT the work (the note of a hand-over, the path of steps): not for those outside the DM the Task was born in.
 * @param teamwork - The teamwork fields of a Task view.
 * @returns The same view without the note and the path.
 */
export function withoutDmWords<T extends { readonly note?: unknown; readonly path?: unknown }>(teamwork: T): Omit<T, 'note' | 'path'> {
  const { note, path, ...rest } = teamwork
  void note
  void path
  return rest
}

/** The fields of an action preview that carry the words of the work (who it goes to, what it says, how much, which files): not for those outside the DM the Task was born in. */
const ACTION_PREVIEW_WORDS: ReadonlySet<string> = new Set(['to', 'cc', 'bcc', 'attachments', 'subject', 'body', 'amount', 'payee', 'reference', 'items', 'count', 'sentTo', 'failureReason'])

/**
 * The Task an action card of the approvals inbox belongs to (`action:<ticketId>:<n>`, see `ExternalActions.record`).
 * @param id - The card id.
 * @returns The ticket id.
 */
export function ticketOfActionCard(id: string): string {
  return id.replace(/^action:/u, '').replace(/:\d+$/u, '')
}

/**
 * Carbon R2-05: the cards of the approvals inbox that come from a Task born in a DM. The open-question card carries the Task title; the action card (a connector e-mail, post, payment) carries the REAL
 * content it would send. Whoever is not in the DM reads the neutral title and an action card with its class, verb, connector and state, and nothing of what was written (to, subject, body…).
 * @param card - The card as the host lists it.
 * @param seen - Whether the session may see inside a Task (`ticketSeenByActor` for that Task).
 * @returns The card, or its neutral form.
 */
export function maskDmApprovalCard(card: ApprovalView, seen: (ticketId: string) => boolean): ApprovalView {
  if (card.kind === 'attention') return seen(card.id) ? card : { ...card, title: PRIVATE_DM_TASK_TITLE, question: PRIVATE_DM_TASK_TITLE }
  if (card.kind === 'connector') {
    // The request to use a connector quotes the Task it is for (its title) and the reason the persona gave: for a Task born in a DM, neither is for those outside it.
    const taskId = card.connector?.taskId
    if (card.connector === undefined || taskId === undefined || seen(taskId)) return card
    const { taskTitle, purpose, ...rest } = card.connector
    void taskTitle
    void purpose
    return { ...card, question: `${card.personaName} precisa do ${card.connector.connectorName} para uma tarefa de uma conversa privada.`, connector: rest }
  }
  if (card.kind !== 'action' || card.actionPreview === undefined || seen(ticketOfActionCard(card.id))) return card
  const neutral = Object.fromEntries(Object.entries(card.actionPreview).filter(([key]) => !ACTION_PREVIEW_WORDS.has(key))) as unknown as ActionPreviewView
  return { ...card, actionPreview: neutral }
}

/** What the check needs of the host. */
export interface DmTicketViewDeps {
  /** Where the Task lives: the stream of its conversation. */
  readonly conversationOf: (projectId: string, ticketId: string) => { readonly streamKind: 'channel' | 'dm'; readonly ownerId: string } | undefined
  /** The DM and its two participants. */
  readonly dmOf: (dmId: string) => { readonly id: string; readonly participantA: string; readonly participantB: string } | undefined
}

/**
 * Whether the actor may see inside the Task: a Task of a channel belongs to the project, a Task born in a DM only to the DM's participants (the same rule `listMessages` applies to the DM).
 * Fails closed: a DM that cannot be found, or no actor, is "not seen".
 * @param deps - Where the Task lives and who is in the DM.
 * @param actor - The session actor (undefined when the workspace has nobody).
 * @param scope - The Task.
 * @returns true when the Task's title and context may be shown.
 */
export function ticketSeenByActor(
  deps: DmTicketViewDeps,
  actor: Actor | undefined,
  scope: { readonly workspaceId: string; readonly projectId: string; readonly ticketId: string },
): boolean {
  const where = deps.conversationOf(scope.projectId, scope.ticketId)
  if (where === undefined || where.streamKind !== 'dm') return true
  const dm = deps.dmOf(where.ownerId)
  if (dm === undefined || actor === undefined) return false
  return sessionCan(actor, 'read', { type: 'dm', workspaceId: scope.workspaceId, dmId: dm.id, memberIds: [dm.participantA, dm.participantB] })
}

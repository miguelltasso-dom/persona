/**
 * Carbon P0-13 (RED 2): a Task BORN in a DM carries the person's words as its title and has a conversation inside that DM. The DM is private to its participants (reading it, searching it,
 * the memory and the "contexto usado" of its messages already respect that), so what is DERIVED from it must too: the board card, the list of Tasks and the context of its turn say
 * "a Task of a private conversation" to whoever is not in the DM, and nothing of what was written there.
 */

import type { Actor } from '@deepseek-ai/dsh-persona-core'
import { sessionCan } from './auth.ts'

/** What a member who is not in the DM reads where the Task's title would be. */
export const PRIVATE_DM_TASK_TITLE = 'Tarefa de uma conversa privada'

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

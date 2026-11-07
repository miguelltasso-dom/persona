/**
 * CV-5: a work request that names several personas ("@Nina @Bento façam o relatório") is ONE Task. The first named leads it; the
 * others work WITH it — never merely "cited". Kept as a host document (`screen_doc`, no schema change) keyed by the Ticket, so the
 * board card, `listTasks` and the worker's prompt can say "com Bento". The collaborator never gets an extra mandate: it uses its own.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { CollaboratorView } from './types.ts'

const KIND = 'ticket_collaborators'

/** Most collaborators beside the lead (5 personas in all, the cap the UI confirms above). */
export const MAX_COLLABORATORS = 4

/** What is stored per Ticket. */
export interface CollaboratorsDoc {
  readonly ticketId: string
  readonly leadId: string
  readonly personaIds: readonly string[]
}

/**
 * Remember who works with the lead of a Ticket.
 * @param screens - Doc store.
 * @param projectId - Tenant.
 * @param doc - Lead and collaborators.
 */
export function putCollaborators(screens: ScreenRepos, projectId: string, doc: CollaboratorsDoc): void {
  screens.put(projectId, KIND, doc.ticketId, doc)
}

/**
 * @param screens - Doc store.
 * @param projectId - Tenant.
 * @param ticketId - The Ticket.
 * @returns The stored collaborators, or undefined when the Task has none.
 */
export function getCollaborators(screens: ScreenRepos | undefined, projectId: string, ticketId: string): CollaboratorsDoc | undefined {
  return screens?.get<CollaboratorsDoc>(projectId, KIND, ticketId)
}

/**
 * The collaborators of a Ticket as the UI shows them. A persona that no longer exists is left out.
 * @param screens - Doc store.
 * @param projectId - Tenant.
 * @param ticketId - The Ticket.
 * @param nameOf - Display name of a persona id (undefined when gone).
 */
export function collaboratorViews(
  screens: ScreenRepos | undefined,
  projectId: string,
  ticketId: string,
  nameOf: (personaId: string) => string | undefined,
): CollaboratorView[] {
  const doc = getCollaborators(screens, projectId, ticketId)
  if (doc === undefined) return []
  const views: CollaboratorView[] = []
  for (const personaId of doc.personaIds) {
    const name = nameOf(personaId)
    if (name !== undefined) views.push({ personaId, name })
  }
  return views
}

/**
 * "Bento", "Bento e Mia", "Bento, Mia e Leo".
 * @param names - Display names.
 */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1] ?? ''}`
}

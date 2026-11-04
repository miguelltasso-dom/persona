/** Internal Persona deep links. Never opens a network URL. */

export const PERSONA_TASK_SCHEME = 'persona'

/** Ticket ids in deep links: lowercase, digits, hyphen; no path or action. */
export const PERSONA_TICKET_ID = /^[a-z0-9-]{1,64}$/u

export interface PersonaTaskDeepLink {
  readonly kind: 'task'
  readonly ticketId: string
}

/**
 * Parse `persona://task/{ticketId}`. Rejects query, hash, extra path, and odd ids.
 * @param url - Candidate.
 */
export function parsePersonaDeepLink(url: string): PersonaTaskDeepLink | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.protocol !== `${PERSONA_TASK_SCHEME}:`) return undefined
  const host = parsed.hostname === '' ? parsed.host : parsed.hostname
  if (host !== 'task') return undefined
  if (parsed.search !== '' || parsed.hash !== '') return undefined
  let ticketId: string
  try {
    ticketId = decodeURIComponent(parsed.pathname.replace(/^\/+/u, '')).trim()
  } catch (error) {
    // Malformed URL escapes do not identify a task.
    void error
    return undefined
  }
  if (!PERSONA_TICKET_ID.test(ticketId)) return undefined
  return { kind: 'task', ticketId }
}

/**
 * Build the internal task link.
 * @param ticketId - Task id (`[a-z0-9-]{1,64}`).
 */
export function personaTaskHref(ticketId: string): string {
  if (!PERSONA_TICKET_ID.test(ticketId)) throw new Error('invalid persona ticket id')
  return `${PERSONA_TASK_SCHEME}://task/${ticketId}`
}

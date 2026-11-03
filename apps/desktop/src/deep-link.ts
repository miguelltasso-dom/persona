/** Internal Persona deep links. Never opens a network URL. */

export const PERSONA_TASK_SCHEME = 'persona'

export interface PersonaTaskDeepLink {
  readonly kind: 'task'
  readonly ticketId: string
}

/**
 * Parse `persona://task/{ticketId}`.
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
  const ticketId = decodeURIComponent(parsed.pathname.replace(/^\/+/u, '')).trim()
  if (ticketId.length === 0 || ticketId.includes('/') || ticketId.includes('\\')) return undefined
  return { kind: 'task', ticketId }
}

/**
 * Build the internal task link.
 * @param ticketId - Task id.
 */
export function personaTaskHref(ticketId: string): string {
  return `${PERSONA_TASK_SCHEME}://task/${encodeURIComponent(ticketId)}`
}

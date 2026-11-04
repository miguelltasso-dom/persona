/** Internal Persona deep links. Never opens a network URL. */

export const PERSONA_TASK_SCHEME = 'persona'

/** Ticket ids in deep links: lowercase, digits, hyphen; no path or action. */
export const PERSONA_TICKET_ID = /^[a-z0-9-]{1,64}$/u

/** Where a notification click lands (NOTIFICATIONS-SPEC §3). `thread` is the default and carries no query. */
export const PERSONA_LINK_VIEWS = ['thread', 'approvals', 'review', 'overview'] as const
export type PersonaLinkView = typeof PERSONA_LINK_VIEWS[number]

export interface PersonaTaskDeepLink {
  readonly kind: 'task'
  readonly ticketId: string
  /** Absent means the task thread. */
  readonly view?: PersonaLinkView
}

function isLinkView(value: string): value is PersonaLinkView {
  return (PERSONA_LINK_VIEWS as readonly string[]).includes(value)
}

/**
 * Parse `persona://task/{ticketId}` with an optional `?v=thread|approvals|review|overview`.
 * Rejects every other query, a hash, extra path, and odd ids.
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
  if (parsed.hash !== '') return undefined
  let view: PersonaLinkView | undefined
  if (parsed.search !== '') {
    const keys = [...parsed.searchParams.keys()]
    const value = parsed.searchParams.get('v')
    if (keys.length !== 1 || keys[0] !== 'v' || value === null || !isLinkView(value)) return undefined
    view = value
  }
  let ticketId: string
  try {
    ticketId = decodeURIComponent(parsed.pathname.replace(/^\/+/u, '')).trim()
  } catch (error) {
    // Malformed URL escapes do not identify a task.
    void error
    return undefined
  }
  if (!PERSONA_TICKET_ID.test(ticketId)) return undefined
  return view === undefined ? { kind: 'task', ticketId } : { kind: 'task', ticketId, view }
}

/**
 * Build the internal task link.
 * @param ticketId - Task id (`[a-z0-9-]{1,64}`).
 * @param view - Where the click lands; omitted or `thread` opens the task thread (no query).
 */
export function personaTaskHref(ticketId: string, view?: PersonaLinkView): string {
  if (!PERSONA_TICKET_ID.test(ticketId)) throw new Error('invalid persona ticket id')
  const base = `${PERSONA_TASK_SCHEME}://task/${ticketId}`
  return view === undefined || view === 'thread' ? base : `${base}?v=${view}`
}

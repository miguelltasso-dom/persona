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

/** An invitation from outside: `persona://entrar/<time>/<token>`. It names a team and carries a one-time token; it never joins anyone by itself. */
export interface PersonaInviteDeepLink {
  readonly kind: 'invite'
  readonly teamId: string
  readonly token: string
}

const INVITE_PREFIX = `${PERSONA_TASK_SCHEME}://entrar/`
/** The longest link that is read at all (the longest legal pieces make 146). */
const INVITE_LINK_MAX = 160
const INVITE_TEAM_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u
const INVITE_TOKEN = /^[A-Za-z0-9_-]{22,64}$/u

/**
 * Parse EXACTLY `persona://entrar/<time>/<token>` and refuse everything else (a query, a fragment, a port, user info, an escape, a dot-segment, a space, a control
 * character, a look-alike letter, another case, another length). A link from outside opens the app, so this is a door: it is strict, pure
 * (no `URL` object) and it never "cleans" a link and tries again. The same rules live in `persona-sync/src/invite-link.ts`
 * (the host reads the link again before it asks to join); a parity spec keeps the two identical (the desktop does not depend on it).
 * @param url - Whatever arrived (a protocol launch, a second launch's arguments).
 */
export function parsePersonaInviteLink(url: unknown): PersonaInviteDeepLink | undefined {
  if (typeof url !== 'string' || url.length > INVITE_LINK_MAX || !url.startsWith(INVITE_PREFIX)) return undefined
  const parts = url.slice(INVITE_PREFIX.length).split('/')
  if (parts.length !== 2) return undefined
  const [teamId, token] = parts
  if (teamId === undefined || token === undefined || !INVITE_TEAM_ID.test(teamId) || !INVITE_TOKEN.test(token)) return undefined
  return { kind: 'invite', teamId, token }
}

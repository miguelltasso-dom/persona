/**
 * H23 / F4: the invite link `persona://entrar/<time>/<token>`. A link from outside opens the app, so this parser is the whole attack surface of that door and it is strict
 * and PURE (no `node:` imports, no URL object): it accepts exactly one shape and refuses everything else. It never "cleans" a link and tries again.
 *
 * What the link can do is also fixed here: it names a team and carries a one-time token; it never joins anyone by itself (the screen shows the team and a button, and only the
 * button asks to join), and it never carries the address of the hub (that is product configuration, so a forged link cannot point the app at somebody else's server).
 */

/** The only scheme this app registers for the product. */
export const INVITE_SCHEME = 'persona:'
/** The only "host" of the invite link. */
export const INVITE_HOST = 'entrar'
/** The longest link that is read at all (the longest legal pieces — a team id of 64 and a token of 64 — make 146). */
export const INVITE_LINK_MAX = 160

/** A parsed invite link. */
export interface InviteLink {
  readonly teamId: string
  readonly token: string
}

const PREFIX = `${INVITE_SCHEME}//${INVITE_HOST}/`
/** A team id: lower-case letters, digits and dashes (the product's workspace ids). */
const TEAM_ID = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u
/** A token: base64url of at least 128 bits (the host issues 24 random bytes as hex, 48 characters). */
const TOKEN = /^[A-Za-z0-9_-]{22,64}$/u

/**
 * @param link - Whatever arrived (a `persona://` URL from the system, a pasted text).
 * @returns The team and the token, or `undefined` when it is not EXACTLY `persona://entrar/<time>/<token>`.
 */
export function parseInviteLink(link: unknown): InviteLink | undefined {
  if (typeof link !== 'string' || link.length > INVITE_LINK_MAX || !link.startsWith(PREFIX)) return undefined // the scheme and host are lower-case or it is not ours
  const rest = link.slice(PREFIX.length)
  // Exactly two non-empty segments. A query, a fragment, a port, user info, a percent-escape, a dot-segment, a space or a control character cannot match the alphabets below,
  // so the segment test is the whole check: there is no separate "sanitize" step to get wrong.
  const parts = rest.split('/')
  if (parts.length !== 2) return undefined
  const [teamId, token] = parts
  if (teamId === undefined || token === undefined || !TEAM_ID.test(teamId) || !TOKEN.test(token)) return undefined
  return { teamId, token }
}

/**
 * @param link - A link built by the host.
 * @returns The same link, or throws when the pieces would not survive {@link parseInviteLink} (a bug in the caller, never a person's mistake).
 */
export function inviteLinkOf(link: InviteLink): string {
  const built = `${PREFIX}${link.teamId}/${link.token}`
  if (parseInviteLink(built) === undefined) throw new Error('INVITE_LINK_INVALID')
  return built
}

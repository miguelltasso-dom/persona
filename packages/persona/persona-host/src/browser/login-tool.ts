/**
 * COLHEITA 15b: the model asks "entrar em <login do cofre>" and nothing else. This module turns that request into the one
 * page it may fill: the Cofre entry is found by what the person sees (title, user or site), the origin comes from the
 * entry's own site, and the value never leaves the host — the answer is a sentence, never the password.
 */

import { typeLoginBlind, type BlindLoginResult } from './blind-typing.ts'

/** The non-secret fields of a Cofre Login, as the host reads them. */
export interface CofreLoginEntry {
  readonly id: string
  readonly title: string
  readonly site: string
  readonly username: string
}

/** What the person sees when the request names nothing the Cofre has. */
export const LOGIN_UNKNOWN = 'não achei esse login no Cofre; confira o nome e tente de novo'

/** What the person sees when the Cofre has more than one match. */
export const LOGIN_AMBIGUOUS = 'mais de um login do Cofre combina com esse nome; diga o site ou o usuário'

/**
 * Find one Login by title, user or site, ignoring case and accents.
 * @param entries - Every Login of the project.
 * @param asked - What the model wrote.
 * @returns The one entry, or `undefined` when none or several match.
 */
export function resolveLoginEntry(entries: readonly CofreLoginEntry[], asked: string): CofreLoginEntry | undefined {
  const wanted = normalize(asked)
  if (wanted === '') return undefined
  const matches = entries.filter(entry => [entry.title, entry.username, entry.site].some(value => normalize(value).includes(wanted)))
  return matches.length === 1 ? matches[0] : undefined
}

/**
 * The exact origin a login's site must show before anything is typed.
 * @param site - The Cofre entry's site (a URL; a bare host is read as https).
 * @returns The origin, or `undefined` when the site is not a URL.
 */
export function loginOrigin(site: string): string | undefined {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//iu.test(site) ? site : `https://${site}`)
    return url.origin === 'null' ? undefined : url.origin
  } catch {
    return undefined
  }
}

/** A blind login the host is about to run. */
export interface BlindLoginRequest {
  readonly entry: CofreLoginEntry
  /** The sealed password, read by the host; never logged, never returned. */
  readonly password: string
  /** DevTools port of the profile's Chrome. */
  readonly port: number
  /** Clock; default `Date.now`. */
  readonly now?: () => number
  /** Watch window; default of {@link typeLoginBlind}. */
  readonly watchMs?: number
}

/**
 * Fill the login's page and answer in words.
 * @param request - Entry, secret, port.
 * @returns The sentence for the model and whether the password was typed.
 */
export async function blindLogin(request: BlindLoginRequest): Promise<{ readonly typed: boolean; readonly line: string }> {
  const origin = loginOrigin(request.entry.site)
  if (origin === undefined) return { typed: false, line: 'o login do Cofre não tem um site válido; não digitei nada' }
  const result: BlindLoginResult = await typeLoginBlind({
    port: request.port,
    origin,
    password: request.password,
    ...(request.now === undefined ? {} : { now: request.now }),
    ...(request.watchMs === undefined ? {} : { watchMs: request.watchMs }),
  })
  if (!result.ok) return { typed: false, line: result.line }
  return { typed: true, line: `digitei a senha de ${request.entry.title} na página; confira e conclua o login` }
}

/** Case- and accent-insensitive text, for matching what the person typed. */
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

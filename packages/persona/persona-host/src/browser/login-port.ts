/**
 * COLHEITA 15b: the `browser_login` port the harness tool calls. It reads the Cofre login, types the password into the page of
 * that login's own site and answers with words only — never the password, never the page. The value is masked in the host's
 * outputs for ten minutes as soon as it is read.
 */

import type { BrowserLoginPort } from '../harness-ports.ts'
import type { HarnessIdentity } from '../harness-routines.ts'
import { blindLogin, LOGIN_UNKNOWN, resolveLoginEntry, type CofreLoginEntry } from './login-tool.ts'
import type { SecretMask } from './blind-typing.ts'

/** What the port needs from the host. */
export interface BrowserLoginPortsDeps {
  /** The profile a persona is driving right now (no side effect: never opens a Chrome). */
  readonly liveSessionOf: (personaId: string) => { readonly port: number } | undefined
  /** The Cofre Logins of a project (metadata only). */
  readonly loginsOf: (projectId: string) => readonly CofreLoginEntry[]
  /** The sealed password of one entry (host-only). */
  readonly secretOf: (projectId: string, entryId: string) => Promise<string | undefined>
  /** Keeps typed secrets out of the host's outputs. */
  readonly mask: SecretMask
  /** Clock; default `Date.now`. */
  readonly now?: () => number
  /** The typing itself; default {@link blindLogin} (tests replace it). */
  readonly type?: typeof blindLogin
}

/** The harness port of `browser_login`. */
export class BrowserLoginPorts implements BrowserLoginPort {
  private readonly deps: BrowserLoginPortsDeps

  /** @param deps - Browser lease, Cofre and mask. */
  constructor(deps: BrowserLoginPortsDeps) {
    this.deps = deps
  }

  /**
   * @param who - The run's identity.
   * @param input - The Cofre login as the person named it.
   * @returns Typed or not, with the sentence the model reads.
   */
  async open(who: HarnessIdentity, input: { readonly login: string; readonly ticketId: string }):
  Promise<{ readonly ok: true; readonly typed: boolean; readonly message: string } | { readonly ok: false; readonly code: string; readonly message: string }> {
    const live = this.deps.liveSessionOf(who.personaId)
    if (live === undefined) return { ok: false, code: 'unavailable', message: 'este turno não está com o navegador aberto; nada foi digitado' }
    const entry = resolveLoginEntry(this.deps.loginsOf(who.projectId), input.login)
    if (entry === undefined) return { ok: false, code: 'not-found', message: LOGIN_UNKNOWN }
    const password = await this.deps.secretOf(who.projectId, entry.id)
    if (password === undefined) return { ok: false, code: 'not-found', message: 'esse login do Cofre não tem senha guardada' }
    const now = this.deps.now ?? Date.now
    this.deps.mask.add(password, now())
    const result = await (this.deps.type ?? blindLogin)({ entry, password, port: live.port, now })
    return { ok: true, typed: result.typed, message: result.line }
  }
}

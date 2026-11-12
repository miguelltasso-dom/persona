/**
 * COLHEITA 15b: the `browser_login` port the harness tool calls. It reads the Cofre login, types the password into the page of
 * that login's own site and answers with words only — never the password, never the page. The value is masked in the host's
 * outputs for ten minutes as soon as it is read.
 *
 * Carbon P0-02: the answer is built HERE from sentences of the product (the typed sentence from the entry's title alone; a failure only if the product itself wrote it). Whatever text the typing
 * returned, an error it threw included, never reaches the model: a careless typing cannot carry the value (or the page) out through this tool.
 */

import type { BrowserLoginPort } from '../harness-ports.ts'
import type { HarnessIdentity } from '../harness-routines.ts'
import type { CofreCodeRequestView } from '../cofre-2fa.ts'
import { BLIND_CODE_NO_FIELD, BLIND_LOGIN_LINES, type SecretMask } from './blind-typing.ts'
import { blindCode, blindLogin, codeTypedLine, LOGIN_NO_SITE, LOGIN_UNKNOWN, loginTypedLine, resolveLoginEntry, type CofreLoginEntry } from './login-tool.ts'

/** What the model reads when the typing failed for a reason the product has no sentence for. */
export const LOGIN_FAILED = 'não consegui digitar a senha; nada foi concluído'

/** The sentences of a failed typing the product wrote itself; anything else becomes {@link LOGIN_FAILED}. */
const KNOWN_FAILURES: ReadonlySet<string> = new Set([...Object.values(BLIND_LOGIN_LINES), LOGIN_NO_SITE, BLIND_CODE_NO_FIELD])

/** What the model reads when the owner has not filled a card for this Task (Carbon P1-04). */
export const CODE_NOT_FILLED = 'o dono ainda não preencheu o cartão do código desta tarefa; peça com ask_vault_code e espere ele preencher'
/** What the model reads when the card the owner filled was for another login. */
export const CODE_OTHER_LOGIN = 'o código que o dono preencheu é para outro login; confira o login e tente de novo'
/** What the model reads when no code book is wired (a host without the Cofre). */
export const CODE_UNAVAILABLE = 'o código do Cofre não está disponível aqui; nada foi digitado'

/** The 2FA book as the port needs it: the persona's own filled request, its digits without spending them, and spending them once typed. */
export interface FilledCodes {
  readonly filledFor: (projectId: string, who: { readonly personaId: string; readonly ticketId: string }) => CofreCodeRequestView | undefined
  readonly peek: (projectId: string, id: string) => Promise<string | undefined>
  readonly take: (projectId: string, id: string) => Promise<string | undefined>
}

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
  /** Carbon P1-04: the six digits the owner filled (`code: true`). Absent = the tool refuses a code. */
  readonly codes?: FilledCodes
  /** The code typing itself; default {@link blindCode} (tests replace it). */
  readonly typeCode?: typeof blindCode
  /** The password reached the address bar after the call returned; the tab was already sent to `about:blank`. Never carries the value. */
  readonly onLeak?: (info: LoginLeak) => void
}

/** Who and which login, when the password reached the address bar. Names and ids only, never the value. */
export interface LoginLeak {
  readonly projectId: string
  readonly personaId: string
  readonly ticketId: string
  readonly loginId: string
  /** The Cofre entry's title (what the person sees). */
  readonly title: string
}

/** The one sentence the owner reads when the password reached the address bar (Keel, 12/11): fixed words, no value, no address. */
export const LOGIN_LEAK_LINE = 'a senha apareceu no endereço da página; fechei a aba'

/**
 * The activity-book record of a leak. The line says which login and nothing else: the book keeps no address (a GET form puts the value in it).
 * @param leak - Who and which login.
 * @param at - ISO instant.
 */
export function loginLeakActivity(leak: LoginLeak, at: string): { readonly verb: 'browser_leak'; readonly target: { readonly kind: 'cofre-login'; readonly id: string; readonly title: string }; readonly initiator: 'persona-initiative'; readonly status: 'done'; readonly undoable: false; readonly at: string } {
  return { verb: 'browser_leak', target: { kind: 'cofre-login', id: leak.loginId, title: leak.title }, initiator: 'persona-initiative', status: 'done', undoable: false, at }
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
  async open(who: HarnessIdentity, input: { readonly login: string; readonly ticketId: string; readonly code?: boolean }):
  Promise<{ readonly ok: true; readonly typed: boolean; readonly message: string } | { readonly ok: false; readonly code: string; readonly message: string }> {
    const live = this.deps.liveSessionOf(who.personaId)
    if (live === undefined) return { ok: false, code: 'unavailable', message: 'este turno não está com o navegador aberto; nada foi digitado' }
    const entry = resolveLoginEntry(this.deps.loginsOf(who.projectId), input.login)
    if (entry === undefined) return { ok: false, code: 'not-found', message: LOGIN_UNKNOWN }
    if (input.code === true) return this.openCode(who, { ticketId: input.ticketId }, entry, live.port)
    const password = await this.deps.secretOf(who.projectId, entry.id)
    if (password === undefined) return { ok: false, code: 'not-found', message: 'esse login do Cofre não tem senha guardada' }
    const now = this.deps.now ?? Date.now
    this.deps.mask.add(password, now())
    let typed = false
    let line = LOGIN_FAILED
    try {
      const result = await (this.deps.type ?? blindLogin)({ entry, password, port: live.port, now })
      typed = result.typed
      if (!typed && KNOWN_FAILURES.has(result.line)) line = result.line
      // The watch of the address bar outlives this call: a leak into the URL is reported to the host, never to the model.
      void result.watch?.then((outcome) => {
        if (outcome === 'vazou-na-url') this.deps.onLeak?.({ projectId: who.projectId, personaId: who.personaId, ticketId: input.ticketId, loginId: entry.id, title: entry.title })
      }, (error: unknown) => { void error })
    } catch (error) {
      void error // the typing failed: its message may carry anything (the value included), so the model gets our own sentence
    }
    // Last layer: the mask is live from the moment the password was read, so even a title that holds the value is masked.
    const message = typed ? loginTypedLine(entry.title) : line
    return { ok: true, typed, message: this.deps.mask.redact(message, now()) }
  }

  /**
   * Carbon P1-04: the six digits the owner filled in the card go into the page of the login, never through the model. The request must be THIS persona's, for THIS Task, and for THIS login (the owner saw
   * the site on the card): a code filled for the bank is never typed into the shop. The digits are read without spending them, typed, and only then spent: a page that had no field for them does not burn them.
   */
  private async openCode(who: HarnessIdentity, input: { readonly ticketId: string }, entry: CofreLoginEntry, port: number):
  Promise<{ readonly ok: true; readonly typed: boolean; readonly message: string } | { readonly ok: false; readonly code: string; readonly message: string }> {
    const { codes } = this.deps
    if (codes === undefined) return { ok: false, code: 'unavailable', message: CODE_UNAVAILABLE }
    const request = codes.filledFor(who.projectId, { personaId: who.personaId, ticketId: input.ticketId })
    if (request === undefined) return { ok: false, code: 'not-found', message: CODE_NOT_FILLED }
    const named = request.site === undefined ? undefined : resolveLoginEntry(this.deps.loginsOf(who.projectId), request.site)
    if (named?.id !== entry.id) return { ok: false, code: 'mismatch', message: CODE_OTHER_LOGIN }
    const digits = await codes.peek(who.projectId, request.id)
    if (digits === undefined) return { ok: false, code: 'not-found', message: CODE_NOT_FILLED }
    const now = this.deps.now ?? Date.now
    this.deps.mask.add(digits, now())
    let typed = false
    let line = LOGIN_FAILED
    try {
      const result = await (this.deps.typeCode ?? blindCode)({ entry, code: digits, port, now })
      typed = result.typed
      if (!typed && KNOWN_FAILURES.has(result.line)) line = result.line
      void result.watch?.then((outcome) => {
        if (outcome === 'vazou-na-url') this.deps.onLeak?.({ projectId: who.projectId, personaId: who.personaId, ticketId: input.ticketId, loginId: entry.id, title: entry.title })
      }, (error: unknown) => { void error })
    } catch (error) {
      void error // the typing failed: its message may carry the digits, so the model gets our own sentence
    }
    if (typed) await codes.take(who.projectId, request.id) // spent: it is typed, and the sealed slot is dropped
    return { ok: true, typed, message: this.deps.mask.redact(typed ? codeTypedLine(entry.title) : line, now()) }
  }
}

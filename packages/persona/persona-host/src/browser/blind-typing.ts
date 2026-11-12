/**
 * COLHEITA 15b: a password goes from the Cofre into the page without ever crossing a model boundary. The host checks the
 * EXACT origin of the frame, confirms a visible `type=password` field, types with the protocol's `Input.insertText`, and
 * returns only that it typed — never the value.
 *
 * Carbon P0-02: the call returns as soon as the value is in the page (the model must be free to press "Entrar"). The address bar is watched AFTER the return, in the background, for two minutes:
 * a password that lands in a URL (a GET form, a redirect) sends the tab to `about:blank` at once, and the outcome is reported through {@link BlindLoginResult} `watch`.
 *
 * The caller keeps the value out of every output for ten minutes with {@link SecretMask}, which knows the shapes a secret takes on its way through a page.
 */

import { cdpTargets, CdpConnection } from './cdp.ts'

/** How long the address bar is watched for the secret. */
export const LEAK_WATCH_MS = 2 * 60_000
/** How long a typed secret stays masked in the host's outputs. */
export const MASK_MS = 10 * 60_000
/** The mask the person sees instead of the value. */
export const MASK = '••••••'

/** What a blind login needs. */
export interface BlindLoginInput {
  /** DevTools port of the profile's Chrome. */
  readonly port: number
  /** The exact origin the login belongs to (`https://loja.exemplo.com.br`), as the Cofre entry's site. */
  readonly origin: string
  /** The secret; it never appears in a result, an error or a log. */
  readonly password: string
  /** Clock; default `Date.now`. */
  readonly now?: () => number
  /** How long to watch the address bar; default {@link LEAK_WATCH_MS}. */
  readonly watchMs?: number
  /** Poll interval of the watch; default 1000 ms. */
  readonly pollMs?: number
  /**
   * Carbon P1-04: what is typed. `password` (default): the visible `type=password` field. `code`: the six digits of a second factor, into the field the persona just focused (a visible text input), or, when
   * none is focused, the first visible input that says it takes a one-time code. The value is still never returned.
   */
  readonly field?: 'password' | 'code'
}

/** Why a blind login did not type. `vazou-na-url` is what the watch reports after the fact (it is no longer an answer of the call). */
export type BlindLoginFailure = 'sem-pagina' | 'origem-diferente' | 'sem-campo' | 'vazou-na-url'

/** How the watch of the address bar ended: nothing leaked, the secret reached the URL (the tab was sent to `about:blank`), or the watch could not run to the end (the tab closed, Chrome stopped answering). */
export type BlindWatchOutcome = 'limpo' | 'vazou-na-url' | 'interrompida'

/** The answer: typed (with the watch that is still running), or the sentence the screen shows. */
export type BlindLoginResult =
  | { readonly ok: true; readonly origin: string; readonly watch: Promise<BlindWatchOutcome> }
  | { readonly ok: false; readonly reason: BlindLoginFailure; readonly line: string }

/** The only sentences a failed blind login may say; the harness port lets nothing else through to the model. */
export const BLIND_LOGIN_LINES: Readonly<Record<BlindLoginFailure, string>> = {
  'sem-pagina': 'não achei a página desse site aberta no navegador',
  'origem-diferente': 'a página aberta não é o site do login guardado; não digitei nada',
  'sem-campo': 'a página não tem um campo de senha visível; não digitei nada',
  'vazou-na-url': 'a senha apareceu no endereço da página; fechei a digitação e não completei o login',
}

/** The sentence when the page has no field for the code (nothing is typed and the owner's code is kept). */
export const BLIND_CODE_NO_FIELD = 'não achei um campo para o código na página; clique no campo do código e tente de novo'

/** The script that proves the frame and focuses the field of a one-time code; it returns no value of the page. */
function focusCodeScript(origin: string): string {
  return `(() => {
  if (location.origin !== ${JSON.stringify(origin)}) return { ok: false, origin: location.origin }
  const visible = item => item.getClientRects().length > 0 && !item.disabled && !item.readOnly
  const typeable = item => (item instanceof HTMLInputElement ? !['password', 'hidden', 'checkbox', 'radio', 'button', 'submit', 'file', 'image'].includes(item.type) : item instanceof HTMLTextAreaElement)
  const active = document.activeElement
  let field = active !== null && typeable(active) && visible(active) ? active : undefined
  if (field === undefined) {
    field = [...document.querySelectorAll('input')].find(item => typeable(item) && visible(item)
      && (item.autocomplete === 'one-time-code' || item.inputMode === 'numeric' || item.maxLength === 6 || /otp|code|token|codigo|verif/i.test(item.name + ' ' + item.id)))
  }
  if (field === undefined) return { ok: false, origin: location.origin }
  field.focus()
  return { ok: true, origin: location.origin }
})()`
}

/** The script that proves the frame and focuses the password field; it returns no value of the page. */
function focusScript(origin: string): string {
  return `(() => {
  if (location.origin !== ${JSON.stringify(origin)}) return { ok: false, origin: location.origin }
  const field = [...document.querySelectorAll('input[type="password"]')].find(item => item.getClientRects().length > 0)
  if (field === undefined) return { ok: false, origin: location.origin }
  field.focus()
  return { ok: true, origin: location.origin }
})()`
}

/** The shortest variant worth masking (a shorter piece of base64 would shred ordinary text). */
const MIN_VARIANT = 4

/** Base64 of the secret as it appears inside a longer base64 text, at each of the three byte alignments. */
function base64Shapes(secret: string): string[] {
  const data = Buffer.from(secret, 'utf8')
  const start = [0, 2, 3] as const
  const end = [0, 3, 2] as const
  const out: string[] = []
  for (let shift = 0; shift < 3; shift += 1) {
    const padded = Buffer.concat([Buffer.alloc(shift, 0x41), data]).toString('base64')
    const body = padded.slice(start[shift], padded.length - end[(data.length + shift) % 3]!)
    if (body.length < MIN_VARIANT) continue
    out.push(body, body.replace(/\+/gu, '-').replace(/\//gu, '_'))
  }
  return out
}

/**
 * Every shape a secret takes on its way through a page: as typed, percent-encoded (upper and lower case), form-encoded (`+` for a space), JSON-escaped and base64 / base64url at any alignment.
 * @param secret - The value that must not be shown.
 * @returns The distinct shapes, longest first (a long shape is masked before a shorter one it contains).
 */
export function secretForms(secret: string): readonly string[] {
  if (secret === '') return []
  const lower = (text: string): string => text.replace(/%[0-9A-F]{2}/gu, hex => hex.toLowerCase())
  const percent = encodeURIComponent(secret)
  const form = percent.replace(/%20/gu, '+')
  const forms = new Set<string>([secret, percent, form, lower(percent), lower(form), JSON.stringify(secret).slice(1, -1), ...base64Shapes(secret)])
  return [...forms].filter(item => item !== '').sort((a, b) => b.length - a.length)
}

/** Whether an address carries the secret in any shape (the address as Chrome shows it, and decoded). */
function leaksInto(url: string, forms: readonly string[]): boolean {
  let decoded = url
  try { decoded = decodeURIComponent(url.replace(/\+/gu, ' ')) } catch (error) { void error } // a half-typed escape: the raw address is still checked
  return forms.some(form => url.includes(form) || decoded.includes(form))
}

const sleep = async (ms: number): Promise<void> => new Promise<void>((resolve) => { setTimeout(resolve, ms).unref() })

/** Send the tab away from the address that holds the secret and drop that entry of the history; best effort (the tab may already be gone). */
async function sendAway(connection: CdpConnection): Promise<void> {
  try { await connection.send('Page.navigate', { url: 'about:blank' }, 5_000) } catch (error) { void error }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const href = await connection.send<{ result?: { value?: unknown } }>('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, 2_000)
      if (href.result?.value === 'about:blank') break
    } catch (error) {
      void error
      break
    }
    await sleep(50)
  }
  try { await connection.send('Page.resetNavigationHistory', {}, 3_000) } catch (error) { void error }
}

/** Watch the address bar until the deadline; owns the connection and closes it. */
async function watchAddressBar(connection: CdpConnection, password: string, settings: { readonly now: () => number; readonly watchMs: number; readonly pollMs: number }): Promise<BlindWatchOutcome> {
  const forms = secretForms(password)
  const deadline = settings.now() + settings.watchMs
  try {
    while (settings.now() < deadline) {
      const href = await connection.send<{ result?: { value?: unknown } }>('Runtime.evaluate', { expression: 'location.href', returnByValue: true }, 5_000)
      const url = typeof href.result?.value === 'string' ? href.result.value : ''
      if (leaksInto(url, forms)) {
        await sendAway(connection)
        return 'vazou-na-url'
      }
      await sleep(settings.pollMs)
    }
    return 'limpo'
  } catch (error) {
    void error // the tab closed or Chrome stopped answering: nothing left on a page that is gone
    return 'interrompida'
  } finally {
    connection.close()
  }
}

/**
 * Type the Cofre password into the page of its own origin.
 * @param input - Port, exact origin, secret and watch settings.
 * @returns Typed (the watch of the address bar keeps running and reports through `watch`), or the refusal with the sentence for the screen.
 */
export async function typeLoginBlind(input: BlindLoginInput): Promise<BlindLoginResult> {
  const now = input.now ?? Date.now
  const targets = await cdpTargets(input.port)
  const page = targets.find((target) => {
    if (target.type !== 'page') return false
    try { return new URL(target.url).origin === input.origin } catch { return false }
  })
  if (page === undefined) return { ok: false, reason: 'sem-pagina', line: BLIND_LOGIN_LINES['sem-pagina'] }
  const connection = await CdpConnection.open(page.webSocketDebuggerUrl)
  let watching = false
  try {
    const focused = await connection.send<{ result?: { value?: { ok?: boolean; origin?: string } } }>('Runtime.evaluate', {
      expression: input.field === 'code' ? focusCodeScript(input.origin) : focusScript(input.origin),
      returnByValue: true,
    })
    const value = focused.result?.value
    if (value?.origin !== input.origin) return { ok: false, reason: 'origem-diferente', line: BLIND_LOGIN_LINES['origem-diferente'] }
    if (value.ok !== true) return { ok: false, reason: 'sem-campo', line: input.field === 'code' ? BLIND_CODE_NO_FIELD : BLIND_LOGIN_LINES['sem-campo'] }
    await connection.send('Input.insertText', { text: input.password })
    // The value is in the page now. The turn goes on (the model presses "Entrar"); a GET form or a redirect that carries the value away is caught by the watch, which owns the connection from here.
    watching = true
    const watch = watchAddressBar(connection, input.password, { now, watchMs: input.watchMs ?? LEAK_WATCH_MS, pollMs: input.pollMs ?? 1000 })
    return { ok: true, origin: input.origin, watch }
  } finally {
    if (!watching) connection.close()
  }
}

interface MaskEntry {
  readonly forms: readonly string[]
  /** When the window ends; `Infinity` for a PINNED secret (it ends when its owner is released). */
  readonly until: number
  /** Carbon P0-05a: what a pinned secret is tied to (`profile:<id>` = the Chrome that holds its traffic). */
  readonly owner?: string
}

/** Keeps typed secrets out of the host's outputs for a while. */
export class SecretMask {
  private readonly entries: MaskEntry[] = []

  /**
   * @param secret - The value that must not be shown.
   * @param now - Clock.
   * @param ms - How long; default {@link MASK_MS}.
   */
  add(secret: string, now: number, ms: number = MASK_MS): void {
    if (secret === '') return
    this.entries.push({ forms: secretForms(secret), until: now + ms })
  }

  /**
   * Carbon P0-05a: mask a secret for as long as the thing that holds its traffic lives, not for a clock. The warm Chrome keeps the request of the login (and the MCP server of the browser keeps its network
   * list) for as long as the session lives, so ten minutes later `get_network_request` would hand the password over; a pinned secret keeps the window (and the raw reads) closed until its owner is released.
   * @param secret - The value that must not be shown.
   * @param owner - What holds its traffic (`profile:<id>` of the Chrome the page was typed in).
   */
  pin(secret: string, owner: string): void {
    if (secret === '') return
    this.entries.push({ forms: secretForms(secret), until: Number.POSITIVE_INFINITY, owner })
  }

  /**
   * The thing that held the traffic is gone (the Chrome closed): its pinned secrets stop being masked.
   * @param owner - The owner given to {@link SecretMask.pin}.
   */
  release(owner: string): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (this.entries[index]!.owner === owner) this.entries.splice(index, 1)
    }
  }

  /**
   * Whether any typed secret is still masked (the window in which the browser's raw reads stay closed).
   * @param now - Clock.
   */
  live(now: number): boolean {
    this.prune(now)
    return this.entries.length > 0
  }

  /**
   * Replace every live secret, in every shape it takes through a page (see {@link secretForms}), with {@link MASK}.
   * @param text - Any host output.
   * @param now - Clock.
   * @returns The text safe to show.
   */
  redact(text: string, now: number): string {
    let result = text
    for (const entry of this.entries) {
      if (now >= entry.until) continue
      for (const form of entry.forms) result = result.split(form).join(MASK)
    }
    this.prune(now)
    return result
  }

  private prune(now: number): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      if (now >= this.entries[index]!.until) this.entries.splice(index, 1)
    }
  }
}

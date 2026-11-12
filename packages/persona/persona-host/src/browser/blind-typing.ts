/**
 * COLHEITA 15b: a password goes from the Cofre into the page without ever crossing a model boundary. The host checks the
 * EXACT origin of the frame, confirms a visible `type=password` field, types with the protocol's `Input.insertText`, and
 * returns only that it typed — never the value. For two minutes it watches the address bar: a password that lands in a URL
 * (a GET form, a redirect) is reported as a leak, so the caller can close the page instead of finishing the login.
 *
 * The caller keeps the value out of every output for ten minutes with {@link SecretMask}.
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
}

/** Why a blind login did not type. */
export type BlindLoginFailure = 'sem-pagina' | 'origem-diferente' | 'sem-campo' | 'vazou-na-url'

/** The answer: typed, or the sentence the screen shows. */
export type BlindLoginResult =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: BlindLoginFailure; readonly line: string }

const LINES: Readonly<Record<BlindLoginFailure, string>> = {
  'sem-pagina': 'não achei a página desse site aberta no navegador',
  'origem-diferente': 'a página aberta não é o site do login guardado; não digitei nada',
  'sem-campo': 'a página não tem um campo de senha visível; não digitei nada',
  'vazou-na-url': 'a senha apareceu no endereço da página; fechei a digitação e não completei o login',
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

/**
 * Type the Cofre password into the page of its own origin.
 * @param input - Port, exact origin, secret and watch settings.
 * @returns Typed, or the refusal with the sentence for the screen.
 */
export async function typeLoginBlind(input: BlindLoginInput): Promise<BlindLoginResult> {
  const now = input.now ?? Date.now
  const targets = await cdpTargets(input.port)
  const page = targets.find((target) => {
    if (target.type !== 'page') return false
    try { return new URL(target.url).origin === input.origin } catch { return false }
  })
  if (page === undefined) return { ok: false, reason: 'sem-pagina', line: LINES['sem-pagina'] }
  const connection = await CdpConnection.open(page.webSocketDebuggerUrl)
  try {
    const focused = await connection.send<{ result?: { value?: { ok?: boolean; origin?: string } } }>('Runtime.evaluate', {
      expression: focusScript(input.origin),
      returnByValue: true,
    })
    const value = focused.result?.value
    if (value?.origin !== input.origin) return { ok: false, reason: 'origem-diferente', line: LINES['origem-diferente'] }
    if (value.ok !== true) return { ok: false, reason: 'sem-campo', line: LINES['sem-campo'] }
    await connection.send('Input.insertText', { text: input.password })
    // The value is in the page now; watch the address bar so a GET form or a redirect cannot carry it away.
    const deadline = now() + (input.watchMs ?? LEAK_WATCH_MS)
    const encoded = encodeURIComponent(input.password)
    while (now() < deadline) {
      const href = await connection.send<{ result?: { value?: unknown } }>('Runtime.evaluate', { expression: 'location.href', returnByValue: true })
      const url = typeof href.result?.value === 'string' ? href.result.value : ''
      if (url.includes(input.password) || url.includes(encoded)) {
        return { ok: false, reason: 'vazou-na-url', line: LINES['vazou-na-url'] }
      }
      await new Promise<void>((resolve) => { setTimeout(resolve, input.pollMs ?? 1000) })
    }
    return { ok: true, origin: input.origin }
  } finally {
    connection.close()
  }
}

/** Keeps typed secrets out of the host's outputs for a while. */
export class SecretMask {
  private readonly live: { secret: string; until: number }[] = []

  /**
   * @param secret - The value that must not be shown.
   * @param now - Clock.
   * @param ms - How long; default {@link MASK_MS}.
   */
  add(secret: string, now: number, ms: number = MASK_MS): void {
    if (secret === '') return
    this.live.push({ secret, until: now + ms })
  }

  /**
   * Replace every live secret (and its URL-encoded form) with {@link MASK}.
   * @param text - Any host output.
   * @param now - Clock.
   * @returns The text safe to show.
   */
  redact(text: string, now: number): string {
    let result = text
    for (const entry of this.live) {
      if (now >= entry.until) continue
      result = result.split(entry.secret).join(MASK).split(encodeURIComponent(entry.secret)).join(MASK)
    }
    for (let index = this.live.length - 1; index >= 0; index -= 1) {
      if (now >= this.live[index]!.until) this.live.splice(index, 1)
    }
    return result
  }
}

/**
 * Single unwrap proxy over `ctx.remote.persona` (Keel P0, Muse). Generated Remote methods resolve to
 * `RemoteResult` ({ ok, value } | { ok: false, error }); refresh/RPC/seed on the live store expect the raw value.
 * Tenant bootstrap is the exception: it calls the raw remote with {@link unwrapRemote} in bootstrap-tenant.ts (see createPersonaLiveStore). Every method call through this proxy resolves to the value or rejects with a typed
 * {@link PersonaRemoteError} carrying a pt-BR message — never a `RemoteResult` and never `x.find is not a function`.
 * Non-result returns (streams/AsyncIterable, plain values from test fakes) pass through untouched.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { unwrapRemote } from '../data/remote-call.ts'

/** Typed failure of a persona Remote call (discriminate by `code`). */
export class PersonaRemoteError extends Error {
  override readonly name = 'PersonaRemoteError'
  readonly retryAfterMs?: number

  constructor(
    readonly method: string,
    readonly code: string,
    message: string,
    readonly hostMessage: string,
    retryAfterMs?: number,
  ) {
    super(message)
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs
  }
}

/** True for `{ ok: true, value }` / `{ ok: false, error }` shapes. */
export function isRemoteResult(value: unknown): value is RemoteResult<unknown> {
  if (typeof value !== 'object' || value === null) return false
  const ok = (value as { ok?: unknown }).ok
  if (typeof ok !== 'boolean') return false
  return ok ? 'value' in value : true
}

function failureMessage(method: string, code: string, hostMessage: string): string {
  const detail = hostMessage.length > 0 && hostMessage !== code ? `: ${hostMessage}` : ''
  return `O host da Persona não conseguiu concluir "${method}" (${code})${detail}`
}

async function settle(method: string, value: unknown): Promise<unknown> {
  if (!isRemoteResult(value)) return value
  if (value.ok) return unwrapRemote(value)
  const error = (value.error ?? {}) as {
    readonly code?: unknown
    readonly message?: unknown
    readonly details?: { readonly retryAfterMs?: unknown }
  }
  const code = typeof error.code === 'string' ? error.code : 'unknown'
  const hostMessage = typeof error.message === 'string' ? error.message : ''
  const retryAfterMs = typeof error.details?.retryAfterMs === 'number' ? error.details.retryAfterMs : undefined
  throw new PersonaRemoteError(method, code, failureMessage(method, code, hostMessage), hostMessage, retryAfterMs)
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function'
}

/**
 * Wrap a persona Remote so each method resolves to its raw value (see module doc).
 * @param raw - `ctx.remote.persona` (or a test fake).
 */
export function unwrapPersonaRemote<T extends object>(raw: T): T {
  const cache = new Map<PropertyKey, unknown>()
  return new Proxy(raw, {
    get(target, property) {
      // Read with the raw target as receiver: generated faces call this.invokeRemote(...) internally.
      const member: unknown = Reflect.get(target, property, target)
      if (typeof member !== 'function') return member
      const cached = cache.get(property)
      if (cached !== undefined) return cached
      const method = String(property)
      const wrapped = (...args: unknown[]): unknown => {
        const out: unknown = (member as (...rest: unknown[]) => unknown).apply(target, args)
        if (isThenable(out)) return Promise.resolve(out).then(value => settle(method, value))
        if (isRemoteResult(out)) return settle(method, out)
        return out
      }
      cache.set(property, wrapped)
      return wrapped
    },
  })
}

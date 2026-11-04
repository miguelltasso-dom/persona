/**
 * One gateway in front of every `@Remote`: zod envelope, payload cap,
 * per-peer rate limit, typed faults that never echo hidden ids.
 */

import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'

/** Reject bodies bigger than this (JSON bytes). */
export const REMOTE_PAYLOAD_LIMIT = 256_000
/** `attachFile` carries base64; 256 KB rejected a legal 8 MB upload. */
export const REMOTE_ATTACH_PAYLOAD_LIMIT = 12_000_000
const ATTACH = /^(attach|putFile|upload)/u
/** Sliding window for per-peer, per-method counts. */
export const REMOTE_RATE_WINDOW_MS = 10_000
/**
 * Cheap reads (`list*` / `get*` / `ping` / streams). 120/10s blew up boot:
 * the 9-panel clean-home tour lists subjects once per conversation per panel
 * (React remount + retries). `listConversationSubjects` is a SQLite topic list.
 */
export const REMOTE_RATE_MAX = 2_000
/** Writes stay tighter than reads. */
export const REMOTE_RATE_WRITE_MAX = 240
const TEST_RATE_MAX = 10_000
const WRITE = /^(create|update|put|delete|post|move|accept|reject|enqueue|drop|flush|edit|propose|resolve|comment|record|set|claim|fire|confirm|issue|redeem|schedule|pause|complete|apply|import|wipe|open|plan|start|close|approve|revoke|cancel|ack|tick|backup|restore|checkpoint|draft|invite)/u

const IdField = z.string().max(200)

/** Shared request envelope. Extra fields pass through; known ids must be strings. */
export const RemoteRequestSchema = z.looseObject({
  workspaceId: IdField.optional(),
  projectId: IdField.optional(),
  actorId: IdField.optional(),
  personaId: IdField.optional(),
  accountId: IdField.optional(),
  ticketId: IdField.optional(),
  sprintId: IdField.optional(),
  subjectId: IdField.optional(),
  ownerId: IdField.optional(),
  streamKind: z.string().max(40).optional(),
  provider: z.string().max(64).optional(),
})

/** Typed Remote failure. Message never carries an id the caller did not send. */
export class RemoteFault extends Error {
  /** Structural marker so Typert Gateway ships `code` + `details` (not `gateway/internal`). */
  readonly isDSHRemoteError: true = true
  readonly code: RemoteFaultCode
  readonly details: { readonly retryAfterMs?: number }

  /**
   * @param code - Stable discriminator.
   * @param message - Safe copy (no hidden ids).
   * @param details - `retryAfterMs` on `rate-limited`.
   */
  constructor(code: RemoteFaultCode, message: string, details: { readonly retryAfterMs?: number } = {}) {
    super(message)
    this.name = 'RemoteFault'
    this.code = code
    this.details = details
  }
}

export type RemoteFaultCode =
  | 'invalid-payload'
  | 'payload-too-large'
  | 'rate-limited'
  | 'forbidden'
  | 'not-found'

export interface RemoteGuardOptions {
  readonly payloadLimit?: number
  readonly rateMax?: number
  readonly writeRateMax?: number
  readonly rateWindowMs?: number
  readonly now?: () => number
  readonly peerOf?: () => string
}

/**
 * Per-host Remote gateway. Installed once on the live instance so Typert
 * `service[method](...)` and in-process tests share the same checks.
 */
export class RemoteGuard {
  readonly payloadLimit: number
  readonly rateMax: number
  readonly writeRateMax: number
  readonly rateWindowMs: number
  readonly now: () => number
  readonly peerOf: () => string
  private readonly hits = new Map<string, number[]>()

  /**
   * @param options - Caps and the peer key (session member / invocation).
   */
  constructor(options: RemoteGuardOptions = {}) {
    const testing = process.env.VITEST === 'true'
    this.payloadLimit = options.payloadLimit ?? REMOTE_PAYLOAD_LIMIT
    this.rateMax = options.rateMax ?? (testing ? TEST_RATE_MAX : REMOTE_RATE_MAX)
    this.writeRateMax = options.writeRateMax ?? (testing ? TEST_RATE_MAX : REMOTE_RATE_WRITE_MAX)
    this.rateWindowMs = options.rateWindowMs ?? REMOTE_RATE_WINDOW_MS
    this.now = options.now ?? Date.now
    this.peerOf = options.peerOf ?? (() => 'local')
  }

  /** Drop rate-limit buckets (host reset between tests). */
  reset(): void {
    this.hits.clear()
  }

  /**
   * Validate args, then run the original method. Async rejections are sanitized.
   * @param method - Remote name (for the rate key).
   * @param args - Wire arguments.
   * @param run - Original implementation.
   */
  invoke(method: string, args: readonly unknown[], run: () => unknown): unknown {
    this.admit(method, args)
    try {
      const result = run()
      if (isThenable(result)) {
        return Promise.resolve(result).catch((error: unknown) => {
          sanitizeRemoteError(error, knownIdsOf(args))
        })
      }
      return result
    } catch (error) {
      sanitizeRemoteError(error, knownIdsOf(args))
    }
  }

  /**
   * Size + zod + rate. Throws {@link RemoteFault} before the method runs.
   * @param method - Remote name.
   * @param args - Wire arguments.
   */
  admit(method: string, args: readonly unknown[]): void {
    let encoded = '[]'
    try {
      encoded = JSON.stringify(args)
    } catch {
      throw new RemoteFault('invalid-payload', 'invalid-payload')
    }
    const cap = ATTACH.test(method) ? REMOTE_ATTACH_PAYLOAD_LIMIT : this.payloadLimit
    if (encoded.length > cap) {
      throw new RemoteFault('payload-too-large', 'payload-too-large')
    }
    this.touchRate(method)
    if (args.length === 0) return
    const request = args[0]
    if (!isPlainObject(request)) throw new RemoteFault('invalid-payload', 'invalid-payload')
    if (Object.hasOwn(request, '__proto__') || Object.hasOwn(request, 'constructor')) {
      throw new RemoteFault('invalid-payload', 'invalid-payload')
    }
    const parsed = RemoteRequestSchema.safeParse(request)
    if (!parsed.success) throw new RemoteFault('invalid-payload', 'invalid-payload')
  }

  private touchRate(method: string): void {
    const key = `${this.peerOf()}:${method}`
    const now = this.now()
    const cap = WRITE.test(method) ? this.writeRateMax : this.rateMax
    const fresh = (this.hits.get(key) ?? []).filter(at => now - at < this.rateWindowMs)
    if (fresh.length >= cap) {
      const oldest = fresh[0] ?? now
      const retryAfterMs = Math.max(1, this.rateWindowMs - (now - oldest))
      throw new RemoteFault('rate-limited', 'rate-limited', { retryAfterMs })
    }
    fresh.push(now)
    this.hits.set(key, fresh)
  }
}

/**
 * Wrap every `@Remote` on a live host instance.
 * @param host - Persona host.
 * @param guard - Shared gateway.
 */
export function installRemoteGuard(host: object, guard: RemoteGuard): void {
  for (const marker of remoteMethods(host)) {
    const original: unknown = Reflect.get(host, marker.method)
    if (typeof original !== 'function') continue
    const bound = (original as (...args: unknown[]) => unknown).bind(host)
    Reflect.set(host, marker.method, (...args: unknown[]) => guard.invoke(marker.method, args, () => bound(...args)))
  }
}

/** UUIDs and stream/invite tokens the caller must already know to see. */
const HIDDEN_ID = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\b(?:dm|invite|secret)[-:][\w.-]+\b/giu

/**
 * Re-throw. Hidden ids the caller did not send are stripped; other faults stay.
 * @param error - Original throw.
 * @param knownIds - Ids present on the request.
 */
export function sanitizeRemoteError(error: unknown, knownIds: readonly string[]): never {
  if (error instanceof RemoteFault) throw error
  const raw = error instanceof Error ? error.message : 'error'
  const known = new Set(knownIds)
  HIDDEN_ID.lastIndex = 0
  if (!HIDDEN_ID.test(raw)) {
    throw error instanceof Error ? error : new Error(raw)
  }
  HIDDEN_ID.lastIndex = 0
  const stripped = raw.replace(HIDDEN_ID, token => (known.has(token) ? token : '…'))
  const code = classifyRemoteError(raw)
  throw new RemoteFault(code, stripped === raw ? raw : stripped)
}

/**
 * Collect string ids the caller already sent.
 * @param args - Wire arguments.
 */
export function knownIdsOf(args: readonly unknown[]): string[] {
  const ids: string[] = []
  const walk = (value: unknown): void => {
    if (typeof value === 'string' && value.length > 0 && value.length <= 200) ids.push(value)
    else if (Array.isArray(value)) value.forEach(walk)
    else if (isPlainObject(value)) Object.values(value).forEach(walk)
  }
  args.forEach(walk)
  return ids
}

function classifyRemoteError(message: string): RemoteFaultCode {
  if (message === 'forbidden' || message === 'files-forbidden') return 'forbidden'
  if (
    message === 'not-found'
    || message === 'workspace-not-found'
    || message === 'project-not-found'
  ) return 'not-found'
  if (message === 'invalid-payload' || message === 'payload-too-large' || message === 'rate-limited') {
    return message
  }
  if (/forbidden|not allowed|acesso/iu.test(message)) return 'forbidden'
  if (/not-found|não encontr/iu.test(message)) return 'not-found'
  return 'forbidden'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isThenable(value: unknown): value is Promise<unknown> {
  return value !== null && typeof value === 'object' && 'then' in value
}

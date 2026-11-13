/**
 * One gateway in front of every `@Remote`: zod envelope, payload cap,
 * per-peer rate limit, typed faults that never echo hidden ids.
 */

import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { bindIterable, currentCaller, runAs, type Caller } from './remote-web/caller-context.ts'
import { phoneAllows, REMOTE_NOT_ALLOWED } from './remote-web/phone-allow.ts'
import { FEATURE_OFF_REASON, FEATURE_OFF_TEXT } from './surface-gates.ts'

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
/**
 * Carbon P0-13: a few Remotes cost far more than a read, or can be GUESSED, so each carries its OWN strict limit (per peer, per method), the same in the app and in tests:
 * the pairing code (eight characters: five tries in ten minutes; the PairingBook locks too) and the voice model (about 43 MB moved per answer).
 */
export const REMOTE_STRICT_LIMITS: Readonly<Record<string, { readonly max: number; readonly windowMs: number }>> = {
  pairStation: { max: 5, windowMs: 600_000 },
  ensureVoiceModel: { max: 5, windowMs: 60_000 },
}
const WRITE = /^(create|update|put|delete|grant|post|move|accept|reject|enqueue|drop|flush|edit|propose|resolve|comment|record|set|claim|fire|confirm|issue|redeem|schedule|pause|complete|apply|import|wipe|open|plan|start|close|approve|revoke|cancel|ack|tick|backup|restore|checkpoint|draft|invite|connect|sync|retry|dismiss|undo|save|remove|fill|take|release|rename|pair|pin(?!g)|unpin|refresh|forget|answer|continue|ensure|stop|steer)/u

const IdField = z.string().max(200)

/** Shared request envelope. Extra fields pass through; known ids must be strings. */
export const RemoteRequestSchema = z.looseObject({
  workspaceId: IdField.optional(),
  projectId: IdField.optional(),
  actorId: IdField.optional(),
  personaId: IdField.optional(),
  accountId: IdField.optional(),
  ticketId: IdField.optional(),
  triggerId: IdField.optional(),
  restorePointId: IdField.optional(),
  sprintId: IdField.optional(),
  subjectId: IdField.optional(),
  ownerId: IdField.optional(),
  streamKind: z.string().max(40).optional(),
  provider: z.string().max(64).optional(),
})

/**
 * The closed vocabulary of `RemoteFault.details.reason`: a stable, kebab-case id the client keys on instead of reading the message (Anvil/Keel, CV-6).
 * Never a sentence for a person.
 */
export type RemoteFaultReason = 'channel-archived' | 'feature-off' | 'connector-not-available' | 'connector-ambiguous' | 'remote-not-allowed' | 'pc-only' | 'device-revoked'

/** What a fault carries besides its code. */
export interface RemoteFaultDetails {
  readonly retryAfterMs?: number
  readonly reason?: RemoteFaultReason
}

/** Typed Remote failure. Message never carries an id the caller did not send. */
export class RemoteFault extends Error {
  /** Structural marker so Typert Gateway ships `code` + `details` (not `gateway/internal`). */
  readonly isDSHRemoteError: true = true
  readonly code: RemoteFaultCode
  readonly details: RemoteFaultDetails

  /**
   * @param code - Stable discriminator.
   * @param message - Safe copy (no hidden ids).
   * @param details - `retryAfterMs` on `rate-limited`.
   */
  constructor(code: RemoteFaultCode, message: string, details: RemoteFaultDetails = {}) {
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
  | 'vault-unavailable'
  | 'approval-waiting'
  | 'conflict'
  | 'not-grantable'
  | 'isolation-partial'
  | 'limit-reached'

export interface RemoteGuardOptions {
  readonly payloadLimit?: number
  readonly rateMax?: number
  readonly writeRateMax?: number
  readonly rateWindowMs?: number
  readonly now?: () => number
  readonly peerOf?: () => string
  /** D-113: whether a call belongs to a surface that is OFF (refused first, with `feature-off`). Absent = nothing is off. */
  readonly surfaceOff?: (method: string) => boolean
  /** M5: who is calling this Remote, from the Peer the Gateway fixed (the per-call view of the service, or `undefined` for an in-process call); throws a RemoteFault when the device is not live. Absent = nobody is asked. */
  readonly callerOf?: (receiver: unknown) => Caller
  /** M5: whether the member of a paired device is the OWNER of the team (the owner's phone may list and revoke devices). */
  readonly isOwnerMember?: (memberId: string) => boolean
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
  readonly surfaceOff: (method: string) => boolean
  readonly callerOf: ((receiver: unknown) => Caller) | undefined
  readonly isOwnerMember: (memberId: string) => boolean
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
    this.surfaceOff = options.surfaceOff ?? (() => false)
    this.callerOf = options.callerOf
    this.isOwnerMember = options.isOwnerMember ?? (() => false)
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
  invoke(method: string, args: readonly unknown[], run: () => unknown, receiver?: unknown): unknown {
    const caller = this.callerOf?.(receiver)
    if (caller === undefined) return this.invokeAs(method, args, run, undefined)
    return runAs(caller, () => this.invokeAs(method, args, run, caller))
  }

  /** The call itself, as `caller` (M5): a paired device reaches only the permitted list; a stream it gets back is pulled as the device. */
  private invokeAs(method: string, args: readonly unknown[], run: () => unknown, caller: Caller | undefined): unknown {
    this.admit(method, args)
    if (caller?.kind === 'paired' && !phoneAllows(method, { memberIsOwner: this.isOwnerMember(caller.memberId) })) throw new RemoteFault('forbidden', 'forbidden', { reason: REMOTE_NOT_ALLOWED })
    try {
      const raw = run()
      const result = caller !== undefined && isAsyncIterable(raw) ? bindIterable(caller, raw) : raw
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
    // D-113: a surface under construction that is OFF refuses its calls HERE, in the funnel of the ACL, before the size, the rate or the method itself: nothing runs.
    if (this.surfaceOff(method)) throw new RemoteFault('forbidden', FEATURE_OFF_TEXT, { reason: FEATURE_OFF_REASON })
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
    const held = currentCaller()
    const who = held?.kind === 'paired' ? `device:${held.deviceId}` : this.peerOf() // M5: a paired device has its own bucket
    const key = `${who}:${method}`
    const now = this.now()
    const strict = REMOTE_STRICT_LIMITS[method]
    const cap = strict?.max ?? (WRITE.test(method) ? this.writeRateMax : this.rateMax)
    const windowMs = strict?.windowMs ?? this.rateWindowMs
    const fresh = (this.hits.get(key) ?? []).filter(at => now - at < windowMs)
    if (fresh.length >= cap) {
      const oldest = fresh[0] ?? now
      const retryAfterMs = Math.max(1, windowMs - (now - oldest))
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
    const target = original as (...args: unknown[]) => unknown
    // M5: keep `this`. The Gateway calls this on a per-call view of the service (`this.ctx.invocation.peer` is who is calling); an in-process call has `this === host`.
    Reflect.set(host, marker.method, function (this: unknown, ...args: unknown[]) {
      const self = this ?? host
      return guard.invoke(marker.method, args, () => target.apply(self, args), self)
    })
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

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value !== null && typeof value === 'object' && Symbol.asyncIterator in value
}

function isThenable(value: unknown): value is Promise<unknown> {
  return value !== null && typeof value === 'object' && 'then' in value
}

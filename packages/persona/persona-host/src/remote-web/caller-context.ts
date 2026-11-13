/**
 * MARCO M5 (Lumen P0/P1): WHO is calling, per call, never in a field of the service. The PersonaHost is one object and the desktop (the owner) and a paired phone call it at the same time, with `await`
 * in between; an identity kept in a mutable field would turn the phone into the owner. So the caller lives in an `AsyncLocalStorage`, set at ONE place (the funnel in front of every Remote, and the
 * gate's dispatch), and the principle is: **no ambient identity = refused**. Every call through the funnel runs as an EXPLICIT caller (the owner at the keyboard, or a paired device), the host's own entry
 * points (the scheduler, the routines, the boot) run as an explicit `host`, and anything that finds no caller at all — a lost context — is `caller-lost`, never "the owner".
 *  - a stream (an async iterable) is wrapped so EVERY `next()` re-enters the caller (the body of a generator runs in the context of whoever pulls it, not of whoever made it);
 *  - a listener the host registers during a call is bound to that call (`bindListener`), so an event emitted by ANOTHER call never runs it as the wrong caller.
 */

import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'

/** The caller of one call. The owner and the host carry no member: the host knows its own session member. */
export type Caller =
  /** The owner at the keyboard (the Electron peer, or an in-process call through the funnel). */
  | { readonly kind: 'owner' }
  /** The host acting by itself (the scheduler, a routine, the boot): labelled at those entry points with {@link runAsHost}. */
  | { readonly kind: 'host' }
  /** A paired device: the member the owner chose at pairing, never what the wire says. */
  | { readonly kind: 'paired'; readonly memberId: string; readonly deviceId: string }

/** The refusal: the call may not go on. The host maps it to its `forbidden` fault. */
export class CallerRefused extends Error {
  /** @param why - A stable reason for the log (never shown to a person). */
  constructor(readonly why: 'caller-lost' | 'device-not-live' | 'pc-only') {
    super(`caller refused: ${why}`)
    this.name = 'CallerRefused'
  }
}

const store = new AsyncLocalStorage<Caller>()

/**
 * Run a function as a caller (every await inside keeps the caller).
 * @param caller - Who is calling.
 * @param run - The call.
 * @returns What `run` returns.
 */
export function runAs<T>(caller: Caller, run: () => T): T {
  return store.run(caller, run)
}

/**
 * Run a function as the HOST acting by itself (the entry points of the scheduler, the routines, the boot). Said out loud so the absence of a caller can mean "lost".
 * @param run - The host's own work.
 * @returns What `run` returns.
 */
export function runAsHost<T>(run: () => T): T {
  return store.run({ kind: 'host' }, run)
}

/** @returns The caller of the code that is running now, if it runs inside one. */
export function currentCaller(): Caller | undefined {
  return store.getStore()
}

/**
 * Wrap a stream so every pull runs as the caller (a generator body runs in the context of the code that calls `next()`, which for a Remote stream is the Gateway, not the funnel).
 * @param caller - Who the stream speaks for.
 * @param source - The stream the Remote returned.
 * @returns A stream that yields the same items, each pull as `caller`.
 */
export function bindIterable<T>(caller: Caller, source: AsyncIterable<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const iterator = source[Symbol.asyncIterator]()
      const as = <R>(run: () => R): R => store.run(caller, run)
      return {
        next: (...args) => as(() => iterator.next(...args)),
        ...(iterator.return === undefined ? {} : { return: (value?: unknown) => as(() => (iterator.return as (value?: unknown) => Promise<IteratorResult<T>>)(value)) }),
        ...(iterator.throw === undefined ? {} : { throw: (error?: unknown) => as(() => (iterator.throw as (error?: unknown) => Promise<IteratorResult<T>>)(error)) }),
      }
    },
  }
}

/**
 * Bind a listener to the call that registers it (it runs as that caller wherever the event is emitted from).
 * @param listener - What the host registers during a call.
 * @returns The same function, bound.
 */
export function bindListener<A extends unknown[], R>(listener: (...args: A) => R): (...args: A) => R {
  return AsyncResource.bind(listener)
}

/** What `resolveMember` needs to decide. */
export interface MemberQuestion {
  /** Whether a paired device is still allowed (not revoked, not expired). */
  readonly isLive: (deviceId: string) => boolean
  /** The host's own session member (the owner's): what the owner and the host act as. */
  readonly host: string | undefined
}

/**
 * The member the running code speaks for. FAILS CLOSED.
 * @param question - The device check and the host's own member.
 * @returns The member id (`undefined` only when the host has no session member and the caller is the owner or the host).
 * @throws {CallerRefused} when there is NO caller (a lost context) or the paired device is no longer live.
 */
export function resolveMember(question: MemberQuestion): string | undefined {
  const caller = store.getStore()
  if (caller === undefined) throw new CallerRefused('caller-lost')
  if (caller.kind === 'paired') {
    if (!question.isLive(caller.deviceId)) throw new CallerRefused('device-not-live')
    return caller.memberId
  }
  return question.host
}

/**
 * The machine is the OWNER's: only an EXPLICIT owner (or the host itself) passes. A paired device never does, and neither does a call that lost its context.
 * @throws {CallerRefused} `pc-only` for a paired device; `caller-lost` when there is no caller at all.
 */
export function assertMachineOwner(): void {
  const caller = store.getStore()
  if (caller === undefined) throw new CallerRefused('caller-lost')
  if (caller.kind === 'paired') throw new CallerRefused('pc-only')
}

/**
 * Quota exhausted in the MIDDLE of a turn (IV-7).
 *
 * Until now `quota_exhausted` was raised only BEFORE a turn (account policy, `assertReady`). A CLI that hits its limit while
 * running just failed the turn, which `resolveCaughtError` turned into `engine_unavailable` with no reset clock, and a warm
 * runner taken from the pool skipped the pre-flight altogether, so the host could neither wait for the reset nor tell the
 * person "No limite até {hora}".
 *
 * `withQuotaRecheck` fixes both:
 *  - when a turn ends `failed` (or its stream throws something untyped) it re-reads the account's official usage ONCE; if a
 *    window is full it raises `RunnerResolveError('quota_exhausted', { resetAt })`, the typed error the host already routes
 *    into its quota-wait list;
 *  - it REMEMBERS the block, so the next turn on the same (pooled, warm) runner is refused before the CLI starts, until the
 *    reset clock passes (no clock: it re-reads at most once a minute).
 *
 * It never invents a quota failure: if the re-read fails, times out or shows room, the original outcome is passed through
 * untouched. A successful turn costs nothing extra.
 */

import { readOarAccountUsage } from '@deepseek-ai/dsh-persona-usage'
import type { RunEvent, RunHandle, Runner, StartTurnInput } from '../contract.ts'
import { RunnerResolveError, isRunnerResolveError } from './errors.ts'
import { quotaExhausted } from './probe.ts'

export interface QuotaVerdict {
  readonly exhausted: boolean
  /** ISO instant the full windows reset. Absent when no window was full or any full window lacks a clock. */
  readonly resetAt?: string
}

/**
 * Decide from a raw OAR `accountUsage` payload whether the account is out of quota.
 * @param provider - Runner identity (`claude`, `codex`…).
 * @param usage - Raw payload from `probe.accountUsage`.
 * @returns `exhausted` when a published window is at or over 100%; `resetAt` is the LATEST clock among the full windows
 *   (the account is usable again only when all of them reset), and absent when any full window has no clock.
 */
export function quotaVerdict(provider: string, usage: unknown): QuotaVerdict {
  const quota = readOarAccountUsage(provider, usage)
  const full = quota.windows.filter(window => (window.usedPercent ?? 0) >= 100)
  if (!quotaExhausted(usage) && full.length === 0) return { exhausted: false }
  const clocks = full.map(window => window.resetsAt)
  const resetAt = clocks.length === 0 || clocks.some(clock => clock === undefined)
    ? undefined
    : clocks.filter((clock): clock is string => clock !== undefined).sort().at(-1)
  return { exhausted: true, ...(resetAt === undefined ? {} : { resetAt }) }
}

export interface QuotaRecheckOptions {
  /** Runner identity, as in `RunnerResolveError` (`claude`, `codex`…). */
  readonly provider: string
  /** Read the raw account usage (OAR `accountUsage`), already bounded by a timeout. May reject. */
  readonly reread: () => Promise<unknown>
  readonly now?: () => number
  /** With no reset clock, how long a known block is trusted before the usage is read again. Default one minute. */
  readonly rereadEveryMs?: number
}

const DEFAULT_REREAD_MS = 60_000

/**
 * Raise `quota_exhausted` (with its reset clock) when a turn dies because the account ran out, and refuse further turns
 * until it can run again.
 * @param inner - The resolved runner (outermost wrap, so the pooled instance carries the memory).
 * @param options - Provider and how to re-read the usage.
 */
export function withQuotaRecheck(inner: Runner, options: QuotaRecheckOptions): Runner {
  const now = options.now ?? (() => Date.now())
  const everyMs = options.rereadEveryMs ?? DEFAULT_REREAD_MS
  let blocked: { resetAt: string | undefined; checkedAt: number } | undefined

  const typed = (resetAt: string | undefined): RunnerResolveError =>
    new RunnerResolveError('quota_exhausted', options.provider, resetAt === undefined ? {} : { resetAt })

  const verdict = async (): Promise<QuotaVerdict | undefined> => {
    try {
      return quotaVerdict(options.provider, await options.reread())
    } catch {
      // Never turn an unreadable quota into a quota failure: the original outcome stands.
      return undefined
    }
  }

  const block = (found: QuotaVerdict): RunnerResolveError => {
    blocked = { resetAt: found.resetAt, checkedAt: now() }
    return typed(found.resetAt)
  }

  const guard = async (): Promise<void> => {
    if (blocked === undefined) return
    if (blocked.resetAt !== undefined) {
      if (now() < Date.parse(blocked.resetAt)) throw typed(blocked.resetAt)
      blocked = undefined
      return
    }
    if (now() - blocked.checkedAt < everyMs) throw typed(undefined)
    const found = await verdict()
    if (found?.exhausted === true) throw block(found)
    blocked = undefined
  }

  const begin = (method: (input: StartTurnInput) => Promise<RunHandle>) => async (input: StartTurnInput): Promise<RunHandle> => {
    await guard()
    return method(input)
  }

  const play = (source: (handle: RunHandle) => AsyncIterable<RunEvent>) => async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    try {
      for await (const event of source(handle)) {
        if (event.type === 'ended' && event.report.state === 'failed') {
          const found = await verdict()
          if (found?.exhausted === true) throw block(found)
        }
        yield event
      }
    } catch (error) {
      if (isRunnerResolveError(error)) throw error
      const found = await verdict()
      if (found?.exhausted === true) throw block(found)
      throw error
    }
  }

  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: begin(input => inner.start(input)),
    startTurn: begin(input => inner.startTurn(input)),
    stream: play(handle => inner.stream(handle)),
    events: play(handle => inner.events(handle)),
    cancel: handle => inner.cancel(handle),
    resume: begin(input => inner.resume(input)),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

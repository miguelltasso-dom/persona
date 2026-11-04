/**
 * Turn usage → persona-usage ledger rows. Tokens only; never secrets.
 * Speaks core kinds (`execution` / `evaluation`). Legacy `exec`/`eval`
 * map only through `usagePortKind` in persona-usage.
 */

import { usagePortKind, usagePortWindow, type CanonicalTurnKind } from '@deepseek-ai/dsh-persona-usage'
import type { RunEvent, RunHandle, Runner, RunnerUsage } from '../contract.ts'

/** Core ledger kinds the meter writes. */
export type MeterTurnKind = CanonicalTurnKind

/** One measured turn. Matches persona-usage `UsageEvent` fields. */
export interface MeasuredUsage {
  provider: string
  model: string
  window: string
  inputTokens: number
  outputTokens: number
  origin: 'measured'
  at: string
  kind: MeterTurnKind
  accountId?: string
  cacheReadTokens?: number
  cacheWriteTokens?: number
  /**
   * Wall time of the turn in whole milliseconds (`ended.at − started.at` of the SAME stream). Absent when the turn emitted no
   * `started`, or the two instants do not give a number ≥ 0: never an invented 0 (OPT-9 estimate calibration).
   */
  durationMs?: number
}

export interface UsageMeterSink {
  record(entry: MeasuredUsage): void
}

/** UsageStore.record subset — no package import (Anvil wires persona-usage). */
export interface UsageStorePort {
  record(event: {
    personaId: string
    projectId: string
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    origin: 'measured'
    at: string
    runId?: string
    window?: string
    kind?: MeterTurnKind
    accountId?: string
    cacheReadTokens?: number
    cacheWriteTokens?: number
    durationMs?: number
  }): void
}

export interface UsageMeterOptions {
  readonly kind?: MeterTurnKind
  readonly accountId?: string
}

/**
 * talk → triage, task → execution. Other cheap work keeps its name.
 * @param work - Host purpose or cheap kind (may still say `exec`/`eval`).
 */
export function meterTurnKind(work: string): MeterTurnKind {
  if (work === 'talk') return 'triage'
  if (work === 'task') return 'execution'
  return usagePortKind(work)
}

/**
 * Copy vendor cache counters. Missing fields stay omitted (never 0%).
 * @param usage - Runner snapshot.
 */
export function meterCacheOf(usage: RunnerUsage): Pick<MeasuredUsage, 'cacheReadTokens' | 'cacheWriteTokens'> {
  return {
    ...(usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens }),
    ...(usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens }),
  }
}

/**
 * Bridge resolveRunner → UsageStore. Tokens only; never secrets.
 * @param store - Anvil SQLite or the memory store.
 * @param scope - Persona/project of this run.
 */
export function usageStoreSink(
  store: UsageStorePort,
  scope: { personaId: string; projectId: string },
): UsageMeterSink {
  return {
    record(entry: MeasuredUsage): void {
      store.record({
        personaId: scope.personaId,
        projectId: scope.projectId,
        provider: entry.provider,
        model: entry.model,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        origin: 'measured',
        at: entry.at,
        window: entry.window,
        kind: entry.kind,
        ...(entry.accountId === undefined ? {} : { accountId: entry.accountId }),
        ...meterCacheOf(entry),
        ...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs }),
      })
    },
  }
}

/**
 * Whole milliseconds between the start and the end of one turn.
 * @param startedAt - `started.at` ISO instant, when the stream emitted one.
 * @param endedAt - `ended.at` ISO instant.
 * @returns An integer ≥ 0, or undefined when either instant is missing or unparseable or the end precedes the start.
 */
export function turnDurationMs(startedAt: string | undefined, endedAt: string): number | undefined {
  if (startedAt === undefined) return undefined
  const span = Date.parse(endedAt) - Date.parse(startedAt)
  return Number.isFinite(span) && span >= 0 ? Math.round(span) : undefined
}

/**
 * After a turn ends, publish `usage()` to the sink.
 * @param inner - Resolved runner.
 * @param sink - Ledger (Anvil wires persona-usage).
 * @param provider - CLI id or `dsh`.
 * @param options - Canonical kind + account.
 */
export function withUsageMeter(
  inner: Runner,
  sink: UsageMeterSink,
  provider: string,
  options: UsageMeterOptions = {},
): Runner {
  const kind = options.kind ?? 'execution'
  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    // The FIRST `started` of this turn; a stream with none yields no duration.
    let startedAt: string | undefined
    for await (const event of inner.stream(handle)) {
      if (event.type === 'started' && startedAt === undefined) startedAt = event.at
      if (event.type === 'ended') {
        const usage = await inner.usage(handle)
        const durationMs = turnDurationMs(startedAt, event.at)
        startedAt = undefined
        sink.record({
          provider,
          model: handle.model,
          window: usagePortWindow(kind),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          origin: 'measured',
          at: event.at,
          kind,
          ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
          ...meterCacheOf(usage),
          ...(durationMs === undefined ? {} : { durationMs }),
        })
        yield { type: 'usage', at: event.at, usage }
      }
      yield event
    }
  }
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => inner.start(input),
    startTurn: input => inner.startTurn(input),
    stream: play,
    events: play,
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(input),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: input => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

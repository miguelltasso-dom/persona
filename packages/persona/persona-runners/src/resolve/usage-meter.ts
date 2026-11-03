/**
 * Turn usage → persona-usage ledger rows. Tokens only; never secrets.
 */

import type { RunEvent, RunHandle, Runner } from '../contract.ts'

/** One measured turn. Matches persona-usage `UsageRecord` fields. */
export interface MeasuredUsage {
  provider: string
  model: string
  window: string
  inputTokens: number
  outputTokens: number
  origin: 'measured'
  at: string
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
  }): void
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
      })
    },
  }
}

/**
 * After a turn ends, publish `usage()` to the sink.
 * @param inner - Resolved runner.
 * @param sink - Ledger (Anvil wires persona-usage).
 * @param provider - CLI id or `dsh`.
 */
export function withUsageMeter(inner: Runner, sink: UsageMeterSink, provider: string): Runner {
  const play = async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    for await (const event of inner.stream(handle)) {
      yield event
      if (event.type === 'ended') {
        const usage = await inner.usage(handle)
        sink.record({
          provider,
          model: handle.model,
          window: 'turn',
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          origin: 'measured',
          at: event.at,
        })
        yield { type: 'usage', at: event.at, usage }
      }
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

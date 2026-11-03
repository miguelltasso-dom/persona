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
  }
}

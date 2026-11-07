/**
 * EFF-1 (ships ON in v1.1, 05/11): what the PERSON chose for a persona (model, reasoning effort) and what the call did about it, said next to the tokens so the
 * ledger and the measurements can show it ("a turn on Opus at max" is proven by the ledger, not assumed). Additive: it only adds optional fields to the usage the inner runner reports.
 *  - `modelRequested` / `effortRequested`: the choice, only when there is one (no choice = nothing was sent and nothing is said: the engine's default);
 *  - `modelDropped`: the chosen model the engine does not offer: the call ran on the engine's default instead of failing (the Task is never lost for it).
 * (`effortDropped` is the adapter's own: an effort the model refused.)
 */

import type { RunHandle, Runner, RunnerUsage } from '../contract.ts'

/** What was asked for a persona's call. */
export interface ChoiceReport {
  /** The model the persona was configured with (absent for "padrão do motor"). */
  readonly modelRequested?: string
  readonly effortRequested?: string
  /** The model that was asked for and is not offered by the engine; the call ran on its default. */
  readonly modelDropped?: string
}

/**
 * @param inner - The runner the choice was applied to.
 * @param choice - What the persona asked and what became of it.
 */
export function withChoiceReport(inner: Runner, choice: ChoiceReport): Runner {
  if (choice.modelRequested === undefined && choice.effortRequested === undefined && choice.modelDropped === undefined) return inner
  const annotate = async (handle?: RunHandle): Promise<RunnerUsage> => ({
    ...(await inner.usage(handle)),
    ...(choice.modelRequested === undefined ? {} : { modelRequested: choice.modelRequested }),
    ...(choice.effortRequested === undefined ? {} : { effortRequested: choice.effortRequested }),
    ...(choice.modelDropped === undefined ? {} : { modelDropped: choice.modelDropped }),
  })
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => inner.start(input),
    startTurn: input => inner.startTurn(input),
    stream: handle => inner.stream(handle),
    events: handle => inner.events(handle),
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(input),
    usage: annotate,
    ...(inner.prime === undefined ? {} : { prime: input => inner.prime!(input) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

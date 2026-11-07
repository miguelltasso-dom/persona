/**
 * D-085: the mode each call actually RAN with, written next to its usage so the ledger and the measurements can say what they
 * measured (native / answer-only / needed). `envMode` is the EFFECTIVE mode (what ran); `envModeRequested` appears only when the
 * gate made the call fall back to `native`. Additive: it only adds two optional fields to the usage the inner runner reports.
 */

import type { ConnectorUnreached, RunHandle, Runner, RunnerUsage } from '../contract.ts'
import type { ConnectorFallback } from './connector-reach.ts'
import type { CliEnvMode } from './isolation.ts'

/**
 * @param inner - The runner the plan was applied to.
 * @param modes - What was asked and what ran.
 */
export function withEnvMode(inner: Runner, modes: {
  readonly requested: CliEnvMode
  readonly effective: CliEnvMode
  readonly reason?: string
  /** ISO-5: only present when the call asked for account connectors. */
  readonly connectors?: { readonly loaded: number; readonly dropped: number }
  /** HT-11: only present when the person's option is on and the mode is `needed`. */
  readonly personalSkills?: 'loaded' | 'dropped'
  /** D-096: granted connectors the `needed` launch did not deliver, and what was done about it. Both or none. */
  readonly unreached?: readonly ConnectorUnreached[]
  readonly fallback?: ConnectorFallback
}): Runner {
  const annotate = async (handle?: RunHandle): Promise<RunnerUsage> => ({
    ...(await inner.usage(handle)),
    envMode: modes.effective,
    ...(modes.requested === modes.effective ? {} : { envModeRequested: modes.requested }),
    ...(modes.reason === undefined ? {} : { envModeReason: modes.reason }),
    ...(modes.connectors === undefined ? {} : { connectorsLoaded: modes.connectors.loaded, connectorsDropped: modes.connectors.dropped }),
    ...(modes.personalSkills === undefined ? {} : { personalSkills: modes.personalSkills }),
    ...(modes.unreached === undefined || modes.fallback === undefined ? {} : { connectorsUnreached: modes.unreached, connectorsFallback: modes.fallback }),
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

/**
 * D-096 (the owner, 05/11): `needed` is the default, with two fallbacks to `native`. The first is the proof of the CLI version (`isolation-gate.ts`). The second is this: a task whose GRANTED
 * connector the isolated launch could not reach runs native ONCE (that task only, nothing remembered) and the usage says why. Zero model: it is decided from the connector pre-flight
 * (control requests), before the first token. Pure functions; the typed signal itself is `RunnerUsage.connectorsUnreached` / `connectorsFallback` (contracts/connector-ports.md, "D-096").
 *
 * Why not every reason goes native: the native launch loads every account connector, so it can find one the allow-list missed (`absent`, `many`, `failed`, `timeout`), but it cannot
 * reach one that needs the person to sign in again (`needs-auth`, `no-login`) and costs ~300 000 tokens per request for nothing: that call stays at the `needed` floor and the host says
 * "reconnect". Native never widens what the persona may touch: the permission gate's mandate (`arm({ allowedServers })`, per turn) is what keeps the task inside what the person granted.
 */

import type { ConnectorUnreached, ConnectorUnreachedReason } from '../contract.ts'
import type { ConnectorProbe } from './isolation-run.ts'

/** What the runner did about an unreached granted connector. */
export type ConnectorFallback = 'native-once' | 'floor'

/** The reasons for which the native launch may still find the connector. */
export const NATIVE_CAN_REACH: ReadonlySet<ConnectorUnreachedReason> = new Set<ConnectorUnreachedReason>(['failed', 'absent', 'many', 'timeout'])

/**
 * Why a connector pre-flight says "not usable".
 * @param probe - The pre-flight record; `undefined` = it did not finish in time (or could not run).
 * @returns `undefined` when the connector IS usable.
 */
export function unreachedReasonOf(probe: ConnectorProbe | undefined): ConnectorUnreachedReason | undefined {
  if (probe === undefined) return 'timeout'
  if (probe.ok) return undefined
  return probe.status === 'connected' ? 'failed' : probe.status
}

/**
 * What to do when some granted connectors were not reached.
 * @param unreached - The connectors the isolated launch did not deliver.
 * @returns `undefined` when nothing is unreached; `native-once` when at least one may be found natively; `floor` when none can.
 */
export function connectorFallback(unreached: readonly ConnectorUnreached[]): ConnectorFallback | undefined {
  if (unreached.length === 0) return undefined
  return unreached.some(row => NATIVE_CAN_REACH.has(row.reason)) ? 'native-once' : 'floor'
}

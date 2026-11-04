/** Checks the recorded first-delivery run; the scripted engine checklist is separate. */
import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { CONNECTED_CLI_ORDER, preferConnectedCli } from './engine-policy.ts'

/** Acceptance target: one paid worker execution, with no prompt-injection or coordination turn. */
export const FIRST_DELIVERY_MAX_PAID_TURNS: number = 1

/** Persisted observations collected from one clean-home acceptance run. */
export interface FirstDeliveryRunEvidence {
  readonly askId: string
  readonly ticket: { readonly id: string; readonly triggerId: string; readonly stage: string } | undefined
  readonly loggedCli: readonly string[]
  /** All model calls during the run, including coordination and failed attempts. */
  readonly entries: readonly TurnLedgerEntry[]
  readonly delivery: {
    readonly ticketId: string
    readonly streamKind: string
    readonly ownerId: string
    readonly source: string
    readonly body: string
  } | undefined
  readonly milestone: {
    readonly status: string
    readonly ticketId: string
    readonly feedEventId: string
  }
  readonly milestoneEventIds: readonly string[]
  /** Elapsed time from the beginning of onboarding until the milestone is visible. */
  readonly elapsedMs: number
  readonly maxElapsedMs: number
  /** Shared safety ceiling; first-delivery acceptance additionally requires one execution and no other model turn. */
  readonly maxCalls: number
}

/** First missing observation identifies where the acceptance run stopped. */
export type FirstDeliveryRunFailure =
  | 'ask-ticket'
  | 'connected-cli'
  | 'measured-execution'
  | 'unmeasured-usage'
  | 'call-budget'
  | 'channel-delivery'
  | 'board-done'
  | 'milestone'
  | 'elapsed-time'

/** Evidence score, with reported calls and measured tokens retained for the report. */
export interface FirstDeliveryRunResult {
  readonly passed: boolean
  readonly failed: readonly FirstDeliveryRunFailure[]
  readonly calls: number
  readonly inputTokens: number
  readonly outputTokens: number
}

/**
 * Requires a measured CLI execution linked to the requested ticket, its channel
 * delivery, completed board card, and exactly one persisted milestone. Missing
 * usage or estimated usage cannot establish that a real execution occurred.
 * @param evidence - Observations from the host and app, restricted to this run.
 * @returns Ordered failures and measured cost; never starts a runner.
 */
export function verifyFirstDeliveryRun(evidence: FirstDeliveryRunEvidence): FirstDeliveryRunResult {
  const failed: FirstDeliveryRunFailure[] = []
  const ticket = evidence.ticket
  const connected = preferConnectedCli(evidence.loggedCli)
  const measured = evidence.entries.filter(entry => entry.origin === 'measured'
    && CONNECTED_CLI_ORDER.some(cli => cli === entry.engine))
  const executions = measured.filter(entry => entry.kind === 'execution'
    && entry.ticketId === ticket?.id && entry.engine === connected && entry.outputTokens > 0)
  if (evidence.askId === '' || ticket === undefined || ticket.id === '' || ticket.triggerId !== evidence.askId) {
    failed.push('ask-ticket')
  }
  if (connected === undefined) failed.push('connected-cli')
  if (ticket === undefined || executions.length === 0) failed.push('measured-execution')
  if (measured.length !== evidence.entries.length) failed.push('unmeasured-usage')
  if (!Number.isSafeInteger(evidence.maxCalls) || evidence.maxCalls < 1
    || evidence.entries.length !== FIRST_DELIVERY_MAX_PAID_TURNS || evidence.entries.length > evidence.maxCalls
    || evidence.entries[0]?.kind !== 'execution') failed.push('call-budget')
  const delivery = evidence.delivery
  if (ticket === undefined || delivery === undefined || delivery.ticketId !== ticket.id
    || delivery.streamKind !== 'channel' || delivery.ownerId !== 'geral'
    || delivery.source !== 'runner' || delivery.body.trim() === '') failed.push('channel-delivery')
  if (ticket?.stage !== 'done') failed.push('board-done')
  const milestone = evidence.milestone
  if (ticket === undefined || milestone.status !== 'ready' || milestone.ticketId !== ticket.id
    || milestone.feedEventId === '' || evidence.milestoneEventIds.length !== 1
    || evidence.milestoneEventIds[0] !== milestone.feedEventId) failed.push('milestone')
  if (!Number.isFinite(evidence.elapsedMs) || evidence.elapsedMs < 0
    || evidence.elapsedMs >= evidence.maxElapsedMs) failed.push('elapsed-time')
  return {
    passed: failed.length === 0,
    failed,
    calls: evidence.entries.length,
    inputTokens: measured.reduce((total, entry) => total + entry.inputTokens, 0),
    outputTokens: measured.reduce((total, entry) => total + entry.outputTokens, 0),
  }
}

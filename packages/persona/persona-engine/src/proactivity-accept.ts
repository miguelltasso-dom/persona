/**
 * PRO-6 machine checklist (PROACTIVITY.md §Aceite). Probe / host feed
 * measured flags; this file only scores them.
 */

export interface ProactivityAcceptanceInput {
  readonly idleCyclesWithBacklog: number
  readonly pulledNextOnComplete: boolean
  readonly wokeDependent: boolean
  readonly emptyQueueWithGoal: 'plan' | 'idle_ai' | 'rest'
  readonly emptyQueueWithoutGoalCalls: number
  readonly recoveredFromFullContext: boolean
  readonly silenceHonored: boolean
  readonly awaySummaryHasLinks: boolean
}

export interface ProactivityAcceptance {
  readonly passed: number
  readonly total: 6
  readonly failed: readonly string[]
}

/**
 * Six v1 bullets. Idle with backlog must stay ≤ 1 Vigia cycle. Empty queue
 * + goal must plan (never call a model to idle). No goal ⇒ zero model calls.
 * @param input - Measured flags from a fake-clock run.
 * @returns Passed count and the failed bullet ids.
 */
export function scoreProactivityAcceptance(input: ProactivityAcceptanceInput): ProactivityAcceptance {
  const failed: string[] = []
  if (input.idleCyclesWithBacklog > 1) failed.push('idle-with-backlog')
  if (!input.pulledNextOnComplete || !input.wokeDependent) failed.push('pull-and-wake')
  if (input.emptyQueueWithGoal !== 'plan') failed.push('empty-queue-plans')
  if (input.emptyQueueWithoutGoalCalls !== 0) failed.push('rest-without-goal')
  if (!input.recoveredFromFullContext) failed.push('recover-full-context')
  if (!input.silenceHonored || !input.awaySummaryHasLinks) failed.push('quiet-and-away')
  return { passed: 6 - failed.length, total: 6, failed }
}

/**
 * Ready-criterion check and follow-up proposals after a ticket completes.
 * Work inside the mandate is done, not offered as "I can do X if you want".
 */

import { applyAutonomy, type AutonomyLevel } from './proactivity.ts'

export interface ReadyCheck {
  testsPass: boolean
  evidence: readonly string[]
  leftover: readonly string[]
}

export interface FollowupProposal {
  title: string
  reason: string
  withinMandate: boolean
}

export type Continuation =
  | { kind: 'not_ready'; leftover: string[] }
  | { kind: 'done' }
  | { kind: 'do'; titles: string[] }
  | { kind: 'propose'; titles: string[] }
  | { kind: 'observe'; titles: string[] }

/**
 * @param check - Evidence the worker collected.
 */
export function verifyReady(check: ReadyCheck): { ready: boolean; leftover: string[] } {
  return { ready: check.testsPass, leftover: [...check.leftover] }
}

/**
 * @param check - Ready check.
 * @param discovered - Follow-ups the worker found.
 * @param autonomy - Persona/project autonomy.
 * @param speculative - Speculative work always starts as record-only.
 */
export function continuationAfterReady(
  check: ReadyCheck,
  discovered: readonly FollowupProposal[],
  autonomy: AutonomyLevel,
  speculative = false,
): Continuation {
  const verified = verifyReady(check)
  if (!verified.ready) return { kind: 'not_ready', leftover: verified.leftover }
  const actionable = discovered.filter(item => item.withinMandate)
  if (actionable.length === 0) return { kind: 'done' }
  const titles = actionable.map(item => item.title)
  const decision = applyAutonomy(autonomy, `followup:${titles.join(',')}`, speculative)
  if (decision.kind === 'run') return { kind: 'do', titles }
  if (decision.kind === 'propose') return { kind: 'propose', titles }
  if (decision.kind === 'observe') return { kind: 'observe', titles }
  return { kind: 'done' }
}

/**
 * PRO-6 fake-clock suite: run the six v1 bullets against engine primitives
 * and score them. Probe / host call this; they do not reassemble flags.
 */

import { FakeClock } from './executor/fake.ts'
import { inSilence, mayPropose, proposalDigest, type AttentionBudget } from './budget.ts'
import { MemoryGoalBoard, emptyQueueDecision, spendsModel, ticketGoal } from './goals.ts'
import { MemoryRepositories } from './core/memory.ts'
import { afterAssignmentSettled, type EligibleTicket, type PullContext } from './pull.ts'
import { scoreProactivityAcceptance, type ProactivityAcceptance, type ProactivityAcceptanceInput } from './proactivity-accept.ts'
import { type ViewHost } from './views/host.ts'
import { whileAway } from './views/now.ts'
import { vigiaTick } from './watchdog.ts'

export interface ProactivityMeasure extends ProactivityAcceptance {
  readonly input: ProactivityAcceptanceInput
}

function item(id: string, overrides: Partial<EligibleTicket> = {}): EligibleTicket {
  return { id, personaId: 'bento', priority: 1, deps: [], tools: ['files'], estimatedTokens: 100, ...overrides }
}

function ctx(overrides: Partial<PullContext> = {}): PullContext {
  return {
    now: 1_000,
    personaId: 'bento',
    running: 1,
    maxConcurrent: 2,
    remainingTokens: 10_000,
    remainingRuns: 5,
    allowedTools: ['files'],
    canAssign: () => true,
    completedIds: new Set(),
    ...overrides,
  }
}

/**
 * One fake-clock pass over pull / Vigia / silence / whileAway.
 * @returns Score plus the flags Probe can print.
 */
export function measureProactivityAcceptance(): ProactivityMeasure {
  const idle = vigiaTick({
    stalledTicketIds: [],
    failingEffectKeys: [],
    unavailableEvalIds: [],
    openGoal: true,
    now: 1_000,
    personas: [{ personaId: 'bento', idle: true, queueLength: 3, lastProgressAt: 0, sameReportCount: 0 }],
  })
  const assigned = idle.actions.some(row => row.kind === 'assign' && row.subjectId === 'bento')

  const pull = afterAssignmentSettled(
    'ready',
    'done',
    [item('next', { priority: 2 }), item('child', { deps: ['done'] })],
    ctx({ completedIds: new Set(['done']) }),
  )

  const board = new MemoryGoalBoard()
  board.save(ticketGoal('big', 'launch', 'Site no ar'))
  const withGoal = emptyQueueDecision(0, board.list('launch'))
  const without = emptyQueueDecision(0, [])

  const recover = vigiaTick({
    stalledTicketIds: [],
    failingEffectKeys: [],
    unavailableEvalIds: [],
    openGoal: true,
    now: 20 * 60_000,
    personas: [{
      personaId: 'bento',
      idle: false,
      queueLength: 1,
      lastProgressAt: 1_000,
      sameReportCount: 3,
      runnerFailed: true,
    }],
  }, { noProgressMs: 10 * 60_000, loopCount: 3 })

  const time = new FakeClock(1_000)
  const budget: AttentionBudget = {
    proposalsPerDay: 1,
    proposedToday: 1,
    silenceUntil: 8_000,
    tokensLeft: 100,
    runsLeft: 1,
    acceptanceRate: 0.5,
  }
  const silenceHonored = inSilence(budget, time.now())
    && !mayPropose(budget, time.now())
    && proposalDigest(['A', 'B']).startsWith('Resumo')

  const repo = new MemoryRepositories('pessoal')
  const host: ViewHost = {
    repo,
    projectId: 'pessoal',
    now: () => '2026-11-03T22:00:00.000Z',
    load: { running: 0, queued: 0, maxWorkers: 1 },
    canReadTicket: () => true,
    canReadThread: () => true,
  }
  const digest = whileAway(host, '2026-11-03T12:00:00.000Z', [
    { at: '2026-11-03T18:00:00.000Z', kind: 'proposal', title: 'Contratar confeiteiro', ticketId: 't-hire' },
  ])

  const input: ProactivityAcceptanceInput = {
    idleCyclesWithBacklog: assigned ? 1 : 2,
    pulledNextOnComplete: pull.next?.id === 'next',
    wokeDependent: pull.wake.includes('child'),
    emptyQueueWithGoal: withGoal === 'plan' ? 'plan' : 'idle_ai',
    emptyQueueWithoutGoalCalls: spendsModel(without) ? 1 : 0,
    recoveredFromFullContext: recover.actions.some(row => row.kind === 'recover'),
    silenceHonored,
    awaySummaryHasLinks: digest.items.some(row => row.ticket_id === 't-hire'),
  }
  return { ...scoreProactivityAcceptance(input), input }
}

/** Same score as {@link measureProactivityAcceptance}; name for `@Remote measureProactivityV1`. */
export function measureProactivityV1(): ProactivityMeasure {
  return measureProactivityAcceptance()
}

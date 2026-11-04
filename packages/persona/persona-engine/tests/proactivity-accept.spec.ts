/**
 * PRO-6 / PROACTIVITY.md §Aceite — camada engine (relógio falso).
 * Probe liga o E2E do app; Rivet cobre recuperação real do runner.
 */

import { expect, it } from 'vitest'
import {
  FakeClock,
  MemoryGoalBoard,
  MemoryRepositories,
  afterAssignmentSettled,
  emptyQueueDecision,
  inSilence,
  mayPropose,
  proposalDigest,
  scoreLaziness,
  spendsModel,
  ticketGoal,
  vigiaTick,
  whileAway,
  type AttentionBudget,
  type EligibleTicket,
  type PullContext,
  type ViewHost,
} from '../src/index.ts'

const clock = () => new FakeClock(1_000)

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

it('PRO-6.1 backlog+objetivo: ociosa não passa de 1 ciclo do Vigia', () => {
  const idle = vigiaTick({
    stalledTicketIds: [],
    failingEffectKeys: [],
    unavailableEvalIds: [],
    openGoal: true,
    now: clock().now(),
    personas: [{ personaId: 'bento', idle: true, queueLength: 3, lastProgressAt: 0, sameReportCount: 0 }],
  })
  expect(idle.actions).toContainEqual(expect.objectContaining({ kind: 'assign', subjectId: 'bento' }))
})

it('PRO-6.2 concluir puxa a próxima; dependência acorda a dependente', () => {
  const result = afterAssignmentSettled(
    'ready',
    'done',
    [item('next', { priority: 2 }), item('child', { deps: ['done'] })],
    ctx({ completedIds: new Set(['done']) }),
  )
  expect(result.next?.id).toBe('next')
  expect(result.wake).toEqual(['child'])
})

it('PRO-6.3 fila vazia + objetivo ⇒ planeja; sem objetivo ⇒ descansa sem IA', () => {
  const board = new MemoryGoalBoard()
  board.save(ticketGoal('big', 'launch', 'Site no ar'))
  expect(emptyQueueDecision(0, board.list('launch'))).toBe('plan')
  expect(spendsModel('plan')).toBe(true)
  expect(emptyQueueDecision(0, [])).toBe('rest')
  expect(spendsModel('rest')).toBe(false)
})

it('PRO-6.4 runner cai / contexto cheio ⇒ Vigia recover+backoff (Rivet executa a sessão)', () => {
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
  expect(recover.actions.map(row => row.kind)).toEqual(expect.arrayContaining(['recover', 'retry_backoff']))
  expect(scoreLaziness({ scenario: 'mid_error', completed: false, initiated: false, stoppedEarly: true }).lazy).toBe(true)
})

it('PRO-6.5 silêncio, teto e resumo no lugar de ping', () => {
  const time = clock()
  const budget: AttentionBudget = {
    proposalsPerDay: 1,
    proposedToday: 1,
    silenceUntil: 8_000,
    tokensLeft: 100,
    runsLeft: 1,
    acceptanceRate: 0.5,
  }
  expect(inSilence(budget, time.now())).toBe(true)
  expect(mayPropose(budget, time.now())).toBe(false)
  expect(proposalDigest(['A', 'B'])).toBe('Resumo (2): A; B')
})

it('PRO-6.6 Enquanto você estava fora lista eventos com ticket_id (UI = Anvil/Prism)', () => {
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
    { at: '2026-11-03T10:00:00.000Z', kind: 'proposal', title: 'antes', ticketId: 't-old' },
  ])
  expect(digest.items).toEqual([
    { at: '2026-11-03T18:00:00.000Z', kind: 'proposal', title: 'Contratar confeiteiro', ticket_id: 't-hire' },
  ])
})

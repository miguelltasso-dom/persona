import { expect, it } from 'vitest'
import {
  FakeClock, MemoryGoalBoard, afterAssignmentSettled, applyAutonomy, autonomyMode,
  continuationAfterReady, emptyQueueDecision, inSilence, mayPropose, nextEligible,
  nextProposalIntervalHours, proposalDigest, recordProposalOutcome, spend, spendsModel,
  ticketGoal, verifyReady, vigiaTick, wakeDependents,
} from '../src/index.ts'
import type { AttentionBudget, EligibleTicket, PullContext } from '../src/index.ts'

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
    allowedTools: ['files', 'bash'],
    canAssign: () => true,
    completedIds: new Set(),
    ...overrides,
  }
}

it('puxa a próxima Tarefa elegível por prioridade, deps, permissão, concorrência e orçamento', () => {
  const backlog = [
    item('low', { priority: 1 }),
    item('blocked-dep', { priority: 9, deps: ['missing'] }),
    item('other', { personaId: 'nina', priority: 9 }),
    item('tools', { priority: 8, tools: ['mcp'] }),
    item('costly', { priority: 8, estimatedTokens: 99_000 }),
    item('high', { priority: 5 }),
  ]
  expect(nextEligible(backlog, ctx({ running: 2, maxConcurrent: 2 }))).toBeUndefined()
  expect(nextEligible(backlog, ctx({ remainingRuns: 0 }))).toBeUndefined()
  expect(nextEligible(backlog, ctx({ canAssign: id => id !== 'high' }))?.id).toBe('low')
  expect(nextEligible(backlog, ctx())?.id).toBe('high')
})

it('terminar uma Assignment puxa a próxima e acorda dependentes por evento', () => {
  const backlog = [item('next', { priority: 2 }), item('child', { deps: ['done'] })]
  const result = afterAssignmentSettled('ready', 'done', backlog, ctx({ completedIds: new Set(['done']) }))
  expect(result.next?.id).toBe('next')
  expect(result.wake).toEqual(['child'])
  expect(wakeDependents('done', backlog, new Set(['done']))).toEqual(['child'])
})

it('fila vazia + objetivo aberto planeja; sem objetivo descansa sem IA', () => {
  const board = new MemoryGoalBoard()
  const goal = ticketGoal('big', 'launch', 'Entregar o quadro com testes')
  board.save(goal)
  expect(emptyQueueDecision(2, board.list('launch'))).toBe('work')
  expect(emptyQueueDecision(0, board.list('launch'))).toBe('plan')
  expect(spendsModel('plan')).toBe(true)
  expect(emptyQueueDecision(0, [])).toBe('rest')
  expect(spendsModel('rest')).toBe(false)
  expect(goal.activation).toBe('armed')
  expect(goal.maxRounds).toBe(256)
})

it('continuação: critério de pronto e follow-ups dentro do mandato', () => {
  expect(verifyReady({ testsPass: false, evidence: [], leftover: ['e2e'] })).toEqual({
    ready: false, leftover: ['e2e'],
  })
  const found = [{ title: 'Cobrir e2e', reason: 'faltou', withinMandate: true }]
  expect(continuationAfterReady({ testsPass: true, evidence: ['unit'], leftover: [] }, found, 'act')).toEqual({
    kind: 'do', titles: ['Cobrir e2e'],
  })
  expect(continuationAfterReady({ testsPass: true, evidence: [], leftover: [] }, found, 'propose').kind).toBe('propose')
  expect(continuationAfterReady({ testsPass: true, evidence: [], leftover: [] }, found, 'act', true).kind).toBe('observe')
  expect(continuationAfterReady({ testsPass: true, evidence: [], leftover: [] }, found, 'on_request').kind).toBe('done')
})

it('autonomia: especulativo começa só registrando', () => {
  expect(applyAutonomy('act', 'abrir PR', true)).toEqual({ kind: 'observe', would: 'abrir PR' })
  expect(autonomyMode('act', true)).toBe('observe')
  expect(applyAutonomy('on_request', 'abrir PR')).toEqual({ kind: 'skip' })
  expect(applyAutonomy('propose', 'abrir PR').kind).toBe('propose')
})

it('Vigia: ociosa com fila+objetivo atribui em 1 ciclo; regras com relógio falso', () => {
  const time = clock()
  const base = {
    stalledTicketIds: [] as string[],
    failingEffectKeys: [] as string[],
    unavailableEvalIds: [] as string[],
    openGoal: true,
    now: time.now(),
  }
  const idle = vigiaTick({
    ...base,
    personas: [{ personaId: 'bento', idle: true, queueLength: 2, lastProgressAt: 0, sameReportCount: 0 }],
  })
  expect(idle.actions[0]).toMatchObject({ kind: 'assign', subjectId: 'bento' })
  expect(idle.audit[0]?.action).toBe('assign')

  time.advance(10 * 60_000)
  const stalled = vigiaTick({
    ...base,
    now: time.now(),
    personas: [{ personaId: 'bento', idle: false, queueLength: 0, lastProgressAt: 1_000, sameReportCount: 0 }],
  }, { noProgressMs: 10 * 60_000, loopCount: 3 })
  expect(stalled.actions.map(item => item.kind)).toContain('request_status')

  time.advance(10 * 60_000)
  const recover = vigiaTick({
    ...base,
    now: time.now(),
    personas: [{ personaId: 'bento', idle: false, queueLength: 0, lastProgressAt: 1_000, sameReportCount: 3, runnerFailed: true, waitingOnPersonaId: 'nina' }],
  }, { noProgressMs: 10 * 60_000, loopCount: 3 })
  expect(recover.actions.map(item => item.kind)).toEqual(expect.arrayContaining([
    'recover', 'retry_backoff', 'nudge', 'escalate',
  ]))
})

it('orçamentos: silêncio, teto de propostas, tokens/runs e taxa de aceitação', () => {
  const time = clock()
  const budget: AttentionBudget = {
    proposalsPerDay: 2,
    proposedToday: 2,
    silenceUntil: 5_000,
    tokensLeft: 1_000,
    runsLeft: 3,
    acceptanceRate: 1,
  }
  expect(inSilence(budget, time.now())).toBe(true)
  expect(mayPropose(budget, time.now())).toBe(false)
  time.advance(5_000)
  expect(mayPropose({ ...budget, proposedToday: 1 }, time.now())).toBe(true)
  expect(spend(budget, 200, 1)).toMatchObject({ tokensLeft: 800, runsLeft: 2 })
  const afterReject = recordProposalOutcome({ ...budget, proposedToday: 0, acceptanceRate: 1 }, false)
  expect(afterReject.proposedToday).toBe(1)
  expect(afterReject.acceptanceRate).toBeLessThan(1)
  expect(nextProposalIntervalHours(24, 0)).toBe(48)
  expect(nextProposalIntervalHours(24, 1)).toBe(24)
  expect(proposalDigest(['A', 'B'])).toBe('Resumo (2): A; B')
})

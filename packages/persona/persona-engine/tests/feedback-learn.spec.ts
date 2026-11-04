import { expect, it } from 'vitest'
import {
  learnFromFeedback,
  nextProposalIntervalHours,
  type AttentionBudget,
  type FeedbackEvent,
} from '../src/index.ts'

function budget(): AttentionBudget {
  return {
    proposalsPerDay: 2,
    proposedToday: 0,
    silenceUntil: 0,
    tokensLeft: 500,
    runsLeft: 4,
    acceptanceRate: 0.5,
  }
}

function event(over: Partial<FeedbackEvent> & Pick<FeedbackEvent, 'kind'>): FeedbackEvent {
  return {
    personaId: 'luna',
    title: 'Cobrir onboarding',
    detail: 'Ninguém recebeu a pessoa nova.',
    at: 1_000,
    sourceId: 'src-1',
    ...over,
  }
}

it('aceite vira memória + candidata de skill com proveniência e sobe a frequência', () => {
  const start = budget()
  const learned = learnFromFeedback(event({ kind: 'proposal_accepted' }), start, 4)
  expect(learned.memory.body).toContain('Proposta aceita')
  expect(learned.memory.provenance).toEqual({ event: 'proposal_accepted', sourceId: 'src-1', at: 1_000 })
  expect(learned.skill?.origin).toBe('learned')
  expect(learned.skill?.enabled).toBe(false)
  expect(learned.skill?.provenance.sourceId).toBe('src-1')
  expect(learned.budget.acceptanceRate).toBeGreaterThan(start.acceptanceRate)
  expect(learned.intervalHours).toBeLessThan(nextProposalIntervalHours(4, start.acceptanceRate))
})

it('recusa vira memória, sem skill, e alonga o intervalo', () => {
  const start = budget()
  const learned = learnFromFeedback(event({ kind: 'proposal_rejected', sourceId: 'src-2' }), start, 4)
  expect(learned.memory.body).toContain('Proposta recusada')
  expect(learned.skill).toBeUndefined()
  expect(learned.budget.acceptanceRate).toBeLessThan(start.acceptanceRate)
  expect(learned.intervalHours).toBeGreaterThan(nextProposalIntervalHours(4, start.acceptanceRate))
})

it('revisão aceita gera skill; pedir ajustes não gera e reduz o ritmo', () => {
  const ok = learnFromFeedback(event({ kind: 'review_accepted', title: 'README da home', sourceId: 'rev-1' }), budget(), 4)
  expect(ok.skill?.body).toContain('README da home')
  expect(ok.memory.provenance.event).toBe('review_accepted')
  const start = budget()
  const tweaks = learnFromFeedback(event({ kind: 'review_changes', detail: 'Falta evidência do teste.', sourceId: 'rev-2' }), start, 4)
  expect(tweaks.skill).toBeUndefined()
  expect(tweaks.memory.body).toContain('ajustes')
  expect(tweaks.budget.acceptanceRate).toBeLessThan(start.acceptanceRate)
})

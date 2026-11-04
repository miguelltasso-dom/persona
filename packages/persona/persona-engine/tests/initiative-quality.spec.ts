import { expect, it } from 'vitest'
import {
  initiativeSetClean,
  scoreInitiative,
  type AttentionBudget,
  type ExistingWorkItem,
  type ProjectFact,
} from '../src/index.ts'

function budget(over: Partial<AttentionBudget> = {}): AttentionBudget {
  return {
    proposalsPerDay: 4,
    proposedToday: 0,
    silenceUntil: 0,
    tokensLeft: 800,
    runsLeft: 8,
    acceptanceRate: 0.5,
    ...over,
  }
}

const FACTS: readonly ProjectFact[] = [
  { kind: 'blocked', title: 'Login quebra no Safari', detail: 'PR travada há 2 dias.' },
  { kind: 'deadline', title: 'Enviar o recorte de sexta', detail: 'Prazo amanhã 18h.' },
  { kind: 'gap', title: 'Não há dono do onboarding', detail: 'Ninguém cobre o primeiro dia.' },
]

it('pontua fatos distintos sem vazio nem duplicata', () => {
  const result = scoreInitiative({ facts: FACTS, existing: [], budget: budget(), now: 1 })
  expect(result.proposals).toHaveLength(3)
  expect(initiativeSetClean(result.proposals)).toBe(true)
  expect(result.proposals.every(row => row.reason !== '' && row.title !== '')).toBe(true)
  expect(result.proposals[0]!.score).toBeGreaterThanOrEqual(result.proposals[2]!.score)
})

it('deduplica contra tarefa existente e contra fato repetido', () => {
  const existing: ExistingWorkItem[] = [{ kind: 'ticket', title: 'Login quebra no Safari' }]
  const dupFact: ProjectFact = { kind: 'blocked', title: 'Login quebra no Safari', detail: 'Ainda travado.' }
  const result = scoreInitiative({
    facts: [...FACTS, dupFact],
    existing,
    budget: budget(),
    now: 1,
  })
  expect(result.proposals.some(row => /Login quebra/.test(row.title))).toBe(false)
  expect(result.rejected.some(row => row.why === 'duplicate')).toBe(true)
  expect(initiativeSetClean(result.proposals)).toBe(true)
})

it('título vazio não emite e orçamento zero emite zero', () => {
  const empty: ProjectFact = { kind: 'gap', title: '   ', detail: '' }
  const vacant = scoreInitiative({ facts: [empty], existing: [], budget: budget(), now: 1 })
  expect(vacant.proposals).toEqual([])
  expect(vacant.rejected[0]?.why).toBe('empty')
  const silent = scoreInitiative({
    facts: FACTS,
    existing: [],
    budget: budget({ proposedToday: 4 }),
    now: 1,
  })
  expect(silent.proposals).toEqual([])
  expect(silent.rejected.every(row => row.why === 'budget')).toBe(true)
})

it('suíte sintética: zero propostas duplicadas ou vazias', () => {
  const states: readonly { facts: readonly ProjectFact[]; existing: readonly ExistingWorkItem[] }[] = [
    { facts: FACTS, existing: [] },
    { facts: [FACTS[0]!, FACTS[0]!], existing: [] },
    { facts: FACTS, existing: [{ kind: 'proposal', title: 'Prazo: Enviar o recorte de sexta' }] },
    { facts: [{ kind: 'stale_ticket', title: 'README antigo', detail: 'Sem toque em 10 dias.' }], existing: [] },
  ]
  for (const state of states) {
    const result = scoreInitiative({ ...state, budget: budget(), now: 10 })
    expect(initiativeSetClean(result.proposals), JSON.stringify(result.proposals)).toBe(true)
    expect(result.proposals.some(row => row.title.trim() === '' || row.reason.trim() === '')).toBe(false)
  }
})

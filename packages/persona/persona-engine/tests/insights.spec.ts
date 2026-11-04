import { expect, it } from 'vitest'
import { computeActivationFunnel, computePersonaImpact, listPersonaImpact } from '../src/index.ts'

const DAY = 86_400_000

it('funil sobe onboarding → resposta → tarefa → retorno 7 dias', () => {
  expect(computeActivationFunnel([]).stage).toBe('empty')
  const t0 = 1_000
  const events = [
    { kind: 'onboarded' as const, at: t0 },
    { kind: 'useful_reply' as const, at: t0 + 1_000, personaId: 'luna' },
    { kind: 'task_done' as const, at: t0 + 2_000, personaId: 'luna', durationMs: 3_600_000 },
    { kind: 'session' as const, at: t0 },
    { kind: 'session' as const, at: t0 + 2 * DAY },
  ]
  const funnel = computeActivationFunnel(events)
  expect(funnel).toEqual({
    onboarded: true,
    firstUsefulReply: true,
    firstTaskDone: true,
    returnedIn7Days: true,
    stage: 'returned',
  })
})

it('impacto por persona usa rótulo estimativa e não mistura colegas', () => {
  const events = [
    { kind: 'task_done' as const, at: 1, personaId: 'luna', durationMs: 2_000_000 },
    { kind: 'task_done' as const, at: 2, personaId: 'luna', durationMs: 4_000_000 },
    { kind: 'proposal_accepted' as const, at: 3, personaId: 'luna' },
    { kind: 'task_done' as const, at: 4, personaId: 'guia', durationMs: 1_000 },
  ]
  const luna = computePersonaImpact(events, 'luna')
  expect(luna.tasksCompleted).toBe(2)
  expect(luna.timeToReadyMs).toBe(3_000_000)
  expect(luna.proposalsAccepted).toBe(1)
  expect(luna.hoursSavedEstimate).toBe(1)
  expect(luna.hoursSavedLabel).toBe('estimativa')
  expect(listPersonaImpact(events, ['luna', 'guia'])[1]?.tasksCompleted).toBe(1)
})

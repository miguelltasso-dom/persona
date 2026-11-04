import { expect, it } from 'vitest'
import { firstDeliveryAsk, firstDeliveryTask } from '../src/first-delivery.ts'
import { preRoute } from '../src/preroute/rules.ts'
import { wantsWork, workSkipReason } from '../src/wants-work.ts'

it('Agência P0: Monte a equipe is work; oi is talk', () => {
  expect(wantsWork('Monte a equipe da Agência Ponto para o site e a campanha do cliente.')).toBe(true)
  expect(workSkipReason('Monte a equipe da Agência Ponto para o site e a campanha do cliente.')).toBeUndefined()
  expect(wantsWork('Resuma o Cofre em 5 pontos e proponha a primeira tarefa da semana.')).toBe(true)
  expect(wantsWork('preciso de um README no projeto')).toBe(true)
  expect(wantsWork('oi, tudo bem?')).toBe(false)
  expect(workSkipReason('oi, tudo bem?')).toBe('courtesy')
  expect(wantsWork('obrigado')).toBe(false)
  expect(wantsWork('')).toBe(false)
  expect(workSkipReason('')).toBe('empty')
  expect(wantsWork('legal o lilás')).toBe(false)
  expect(workSkipReason('legal o lilás')).toBe('not-work')
  const routed = preRoute({
    text: 'Monte a equipe da Agência Ponto para o site e a campanha do cliente.',
    at: 1,
    budgetLeft: true,
    silenceUntil: 0,
    senderId: 'miguel',
    threadKey: 'channel:geral',
    window: [],
    personas: [{ id: 'atlas', name: 'Atlas' }],
    canCommand: () => true,
  })
  expect(routed.modelCalled).toBe(true)
  expect(routed.action).toBe('model')
})

it('first delivery ask is a cheap Ticket the host can post after onboarding', () => {
  const brief = 'Agência Ponto — estúdio de sites e campanhas em cidade média.'
  const ask = firstDeliveryAsk({ companyBrief: brief, coordinationName: 'Atlas' })
  expect(wantsWork(ask)).toBe(true)
  const task = firstDeliveryTask({ companyBrief: brief, executorName: 'Nina' })
  expect(task.title).toContain('Resumir o Cofre')
  expect(task.assignment).toContain('Nina')
  expect(task.assignment).toContain('Não invente preço')
  expect(task.readyCriterion.length).toBeGreaterThan(10)
})

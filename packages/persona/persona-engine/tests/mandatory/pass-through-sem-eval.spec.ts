import { expect, it } from 'vitest'
import { accepted, harness, trigger } from './harness.ts'

it('pass-through sem Eval: follow-up no assunto da Tarefa não abre segunda Eval', () => {
  const h = harness()
  accepted(h)
  const evals = h.requests.length
  h.engine.receive(trigger('2'))
  h.pump()
  expect(h.requests.length).toBe(evals)
  const ticket = h.repo.tickets.open()[0]!
  expect(ticket.inputs.some(input => input.kind === 'trigger' && input.triggerId === '2')).toBe(true)
})

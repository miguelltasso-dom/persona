import { expect, it } from 'vitest'
import { accepted, harness } from './harness.ts'

it('Mandate imutável: policyChanged não reescreve force/versão/ator do ticket', () => {
  const h = harness()
  const decision = accepted(h)
  const before = h.repo.tickets.get(decision.ticketId!)!.mandate
  h.setVersion('v2')
  h.engine.policyChanged('v1', 'v2')
  expect(h.repo.tickets.get(decision.ticketId!)!.mandate).toEqual(before)
})

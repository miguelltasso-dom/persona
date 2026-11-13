import { expect, it } from 'vitest'
import { assignVerdict } from '../src/ticket-assign.ts'

/**
 * Marco Dogfood M2 ("distribui para quem é da equipe"): the rule behind `Orchestration.assignTicket`. A card is bound to its owner by `ticket.execution.name`; giving it to a persona of the project is allowed while the Task has
 * NOT started (no turn ran: nothing is orphaned) or has no owner at all; the same owner again changes nothing (idempotent); the persona must be OF the project (the fence). Pure.
 */
const ticket = (over: Record<string, unknown> = {}) => ({ id: 't1', title: 'Escrever a legenda', assignments: [{ state: 'pending' as const }], ...over })
const bia = { name: 'Bia', projectId: 'pp' }

it('a card with NO owner is given to a persona of the project: the owner is the persona\'s name, the directory/assignment default from the card', () => {
  expect(assignVerdict({ ticket: ticket(), persona: bia, projectId: 'pp' })).toEqual({ ok: true, changed: true, execution: { name: 'Bia', directory: '', assignment: 'Escrever a legenda' } })
})

it('a card that has an owner but has NOT started (the assignment is still pending) can be rebalanced; the directory and the assignment text stay', () => {
  const t = ticket({ execution: { name: 'Caio', directory: 'rascunho/caio', assignment: 'Faça a legenda' } })
  expect(assignVerdict({ ticket: t, persona: bia, projectId: 'pp' })).toEqual({ ok: true, changed: true, execution: { name: 'Bia', directory: 'rascunho/caio', assignment: 'Faça a legenda' } })
})

it('the SAME owner again changes nothing (idempotent): the loop may ask every cycle', () => {
  const t = ticket({ execution: { name: 'Bia', directory: '', assignment: 'x' } })
  expect(assignVerdict({ ticket: t, persona: bia, projectId: 'pp' })).toMatchObject({ ok: true, changed: false })
})

it('a card whose Task already STARTED (a turn ran) is not taken from its owner: it would orphan the running work', () => {
  const t = ticket({ execution: { name: 'Caio', directory: '', assignment: 'x' }, assignments: [{ state: 'running', startedAt: '2026-11-12T10:00:00.000Z' }] })
  expect(assignVerdict({ ticket: t, persona: bia, projectId: 'pp' })).toEqual({ ok: false, code: 'ticket-started' })
})

it('the FENCE: a persona of ANOTHER project (or nobody) is refused, whatever the card; an ended or unknown card is refused', () => {
  expect(assignVerdict({ ticket: ticket(), persona: { name: 'Zed', projectId: 'outro' }, projectId: 'pp' })).toEqual({ ok: false, code: 'persona-not-in-project' })
  expect(assignVerdict({ ticket: ticket(), persona: undefined, projectId: 'pp' })).toEqual({ ok: false, code: 'persona-not-in-project' })
  expect(assignVerdict({ ticket: ticket({ ended: { outcome: 'completed' } }), persona: bia, projectId: 'pp' })).toEqual({ ok: false, code: 'ticket-ended' })
  expect(assignVerdict({ ticket: undefined, persona: bia, projectId: 'pp' })).toEqual({ ok: false, code: 'ticket-not-found' })
})

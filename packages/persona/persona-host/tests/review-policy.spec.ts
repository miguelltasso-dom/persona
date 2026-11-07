/**
 * TEAM-6 (D-090): the PERSON sets how a project reviews its deliveries (Projeto › Configurações › "Revisão antes de entregar"):
 * the default of a project nobody configured is ON in every delivery by the Coordenação; the owner turns it off, or limits it to task
 * types, and picks the reviewer. A refused choice writes nothing. The review itself (rounds, seal) is the engine's, run by handoffs.ts.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
  ])
  h.createMember({ id: 'bob', ...SCOPE, displayName: 'Bob', handle: 'bob', role: 'member' })
  return h
}

it('a project nobody configured reviews EVERY delivery, by the Coordenação', () => {
  const h = open()
  expect(h.getReviewPolicy(SCOPE)).toEqual({ mode: 'all', types: [], reviewer: { kind: 'coordination' } })
})

it('the owner turns it off, limits it to task types and picks who reviews; each change is read back', () => {
  const h = open()
  expect(h.setReviewPolicy({ ...SCOPE, mode: 'off', reviewer: { kind: 'coordination' } })).toEqual({ mode: 'off', types: [], reviewer: { kind: 'coordination' } })
  const types = h.setReviewPolicy({ ...SCOPE, mode: 'types', types: ['  Texto ', 'Arte', 'texto'.replace('t', 'T'), ''], reviewer: { kind: 'persona', personaId: 'guia' } })
  expect(types).toEqual({ mode: 'types', types: ['Texto', 'Arte'], reviewer: { kind: 'persona', personaId: 'guia' } }) // trimmed, no duplicates
  expect(h.getReviewPolicy(SCOPE)).toEqual(types)
  expect(h.setReviewPolicy({ ...SCOPE, mode: 'all', reviewer: { kind: 'same-role' } }).reviewer).toEqual({ kind: 'same-role' })
})

it('a refused choice writes nothing: unknown mode, no types, a reviewer from another project, too many types', () => {
  const h = open()
  const before = h.setReviewPolicy({ ...SCOPE, mode: 'all', reviewer: { kind: 'same-role' } })
  expect(() => h.setReviewPolicy({ ...SCOPE, mode: 'sometimes' as unknown as 'all', reviewer: { kind: 'coordination' } })).toThrow(/revisão/iu)
  expect(() => h.setReviewPolicy({ ...SCOPE, mode: 'types', types: [], reviewer: { kind: 'coordination' } })).toThrow(/tipos de tarefa/iu)
  expect(() => h.setReviewPolicy({ ...SCOPE, mode: 'all', reviewer: { kind: 'persona', personaId: 'ghost' } })).toThrow(/equipe deste projeto/iu)
  expect(() => h.setReviewPolicy({ ...SCOPE, mode: 'all', reviewer: { kind: 'someone' as unknown as 'persona' } })).toThrow(/quem revisa/iu)
  expect(() => h.setReviewPolicy({ ...SCOPE, mode: 'types', types: Array.from({ length: 21 }, (_, index) => `tipo ${String(index)}`), reviewer: { kind: 'coordination' } })).toThrow(/até 20/iu)
  expect(() => h.setReviewPolicy({ ...SCOPE, mode: 'types', types: ['x'.repeat(41)], reviewer: { kind: 'coordination' } })).toThrow(/até 20/iu)
  expect(h.getReviewPolicy(SCOPE)).toEqual(before)
})

it('only the workspace owner changes it; a plain member can read it', () => {
  const h = open()
  h.sessionMemberId = 'bob'
  expect(() => h.setReviewPolicy({ ...SCOPE, mode: 'off', reviewer: { kind: 'coordination' } })).toThrow('forbidden')
  h.sessionMemberId = 'ana'
  expect(h.getReviewPolicy(SCOPE).mode).toBe('all')
})

it('the Task and the board card carry "Revisando" and the seal that the team layer reports — and nothing with Config.teamwork off', () => {
  const h = open()
  h.teamworkEnabled = true
  const stamp = '2026-11-05T09:00:00.000Z'
  h.orchestration.runtime('pp').repo.tickets.save({
    id: 'arte', title: 'Arte', decisionId: 'd-arte',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a-arte', state: 'running', createdAt: stamp }], inputs: [], undelivered: [],
    createdAt: stamp, updatedAt: stamp, origin: { triggerId: 't-arte', triggerIds: ['t-arte'] }, execution: { name: 'Bia', directory: '.', assignment: 'x' },
  })
  const reviewing = { personaId: 'guia', round: 1 }
  const reviewedBy = { personaId: 'guia', at: stamp, openPoints: 2 }
  h.handoffs.reviewing = () => reviewing
  h.handoffs.reviewedBy = () => reviewedBy
  const task = h.listTasks(SCOPE).find(row => row.id === 'arte')
  const card = h.getProjectBoard(SCOPE).cards.find(row => row.ticketId === 'arte')
  expect(task).toMatchObject({ reviewing, reviewedBy })
  expect(card).toMatchObject({ reviewing, reviewedBy })
  h.teamworkEnabled = false
  expect(h.listTasks(SCOPE).find(row => row.id === 'arte')).not.toHaveProperty('reviewing')
  expect(h.getProjectBoard(SCOPE).cards.find(row => row.ticketId === 'arte')).not.toHaveProperty('reviewedBy')
})

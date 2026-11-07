import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * Quadros, "entregas em revisão há mais de 2 dias" (Muse, spec): the card carries WHEN the result began to wait for the person
 * (`BoardCardView.inReviewSince`, the instant the worker reported `ready`) — only while the Task is in the person's review.
 */

function rig(): PersonaHost {
  const h = openJourney('2026-11-05T12:00:00.000Z')
  seedJourney(h, [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }])
  h.sessionMemberId = 'ana'
  return h
}

function ticket(id: string, patch: Partial<Ticket> = {}, report?: { state: 'ready' | 'progress'; at: string }): Ticket {
  const stamp = '2026-11-02T09:00:00.000Z'
  return {
    id, title: `Tarefa ${id}`, decisionId: `d-${id}`,
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], inputs: [], undelivered: [], createdAt: stamp, updatedAt: '2026-11-04T09:00:00.000Z',
    assignments: [{ id: `a-${id}`, state: report?.state === 'ready' ? 'ended' : 'running', createdAt: stamp, ...(report === undefined ? {} : { report: { state: report.state, summary: 'x', at: report.at } }) }],
    origin: { triggerId: `t-${id}`, triggerIds: [`t-${id}`] }, execution: { name: 'Bia', directory: '.', assignment: `Tarefa ${id}` },
    ...patch,
  }
}

const cards = (h: PersonaHost) => h.getProjectBoard({ ...SCOPE }).cards

it('a Task waiting for the person\'s review carries the instant its worker reported ready (NOT updatedAt)', () => {
  const h = rig()
  h.orchestration.runtime('pp').repo.tickets.save(ticket('rev', {}, { state: 'ready', at: '2026-11-02T10:30:00.000Z' }))
  const card = cards(h).find(item => item.ticketId === 'rev')
  expect(card?.category).toBe('review')
  expect(card?.inReviewSince).toBe('2026-11-02T10:30:00.000Z') // three days before "now"; updatedAt (11-04) would have lied
})

it('a Task still working, or already finished, has no inReviewSince', () => {
  const h = rig()
  h.orchestration.runtime('pp').repo.tickets.save(ticket('work', {}, { state: 'progress', at: '2026-11-04T10:00:00.000Z' }))
  h.orchestration.runtime('pp').repo.tickets.save(ticket('done', { ended: { at: '2026-11-04T11:00:00.000Z', by: 'human', outcome: 'completed' } }, { state: 'ready', at: '2026-11-04T10:30:00.000Z' }))
  const byId = (id: string) => cards(h).find(item => item.ticketId === id)
  expect(byId('work')?.inReviewSince).toBeUndefined()
  expect(byId('done')?.inReviewSince).toBeUndefined()
})

it('a result that came back for adjustments restarts the clock: the instant is the LATEST ready report', () => {
  const h = rig()
  const first = ticket('again', {}, { state: 'ready', at: '2026-11-01T09:00:00.000Z' })
  const second = { id: 'a2-again', state: 'ended' as const, createdAt: '2026-11-04T08:00:00.000Z', report: { state: 'ready' as const, summary: 'ajustado', at: '2026-11-04T09:30:00.000Z' } }
  h.orchestration.runtime('pp').repo.tickets.save({ ...first, assignments: [...first.assignments, second] })
  expect(cards(h).find(item => item.ticketId === 'again')?.inReviewSince).toBe('2026-11-04T09:30:00.000Z')
})

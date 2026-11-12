/**
 * COLHEITA 5 (Prism): the deadline a card shows ("Vale até hoje, 18h"), the expired card that may be asked again once ("Pedir de novo"),
 * and "executa exatamente o que foi aprovado, uma vez": a second Enviar never approves a second call.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ActionRequestInput } from '../src/external-actions.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const GMAIL = { cli: 'claude', id: 'https://proxy.example.test/v1/mcp/0f0f0f0f', name: 'Gmail' }

function open(): { h: PersonaHost; notes: string[]; ticketId: string } {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Atendimento' },
  ])
  say(h, 'u1', '@Nina responda a cliente')
  const ticketId = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Nina')!.id
  const notes: string[] = []
  h.orchestration.wakeTicket = (_projectId, _ticketId, note) => { notes.push(note); return true }
  return { h, notes, ticketId }
}

const request = (ticketId: string, over: Partial<ActionRequestInput> = {}): ActionRequestInput => ({
  projectId: 'pp', personaId: 'nina', ticketId, connector: GMAIL, tool: 'mcp__gmail__send_email', actionClass: 'send', verb: 'send',
  requestedInput: { to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura', body: 'Oi, Ana! Confirmo os 3 bolos para sexta.' },
  truncated: false, masked: false, argsHash: 'a'.repeat(64), requestedByPerson: true, ...over,
})

const cards = (h: PersonaHost) => h.listApprovals(SCOPE).filter(row => row.kind === 'action')
const pass24h = (h: PersonaHost): void => {
  const later = new Date(Date.parse(h.orchestration.now()) + 25 * 3_600_000).toISOString()
  h.orchestration.now = () => later
}

it('the card carries the deadline it shows: 24 h after it was created', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  const [card] = cards(h)
  expect(card?.actionPreview?.expiresAt).toBe(doc.expiresAt)
  expect(Date.parse(doc.expiresAt) - Date.parse(doc.createdAt)).toBe(24 * 3_600_000)
  expect(card?.actionPreview?.expired).toBeUndefined()
})

it('an unanswered card closes as expired: read-only, never sent, and the persona is told', () => {
  const { h, notes, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  pass24h(h)
  expect(cards(h)[0]).toMatchObject({ status: 'rejected', actionPreview: { status: 'cancelled', expired: true, failureReason: 'expirou' } })
  expect(notes.at(-1)).toMatch(/expirou/u)
  // answering a closed card does nothing: it is never approved after the deadline
  expect(h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' }).actionPreview?.expired).toBe(true)
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([])
})

it('Pedir de novo: only an expired card, once; the persona is told and the SAME call opens a fresh card (nothing is approved)', () => {
  const { h, notes, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  // not expired yet: nothing happens
  expect(h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'retry' }).actionPreview).toMatchObject({ status: 'pending' })
  expect(notes.some(note => /peça de novo/u.test(note))).toBe(false)
  pass24h(h)
  const again = h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'retry' })
  expect(again.actionPreview).toMatchObject({ expired: true, retried: true })
  expect(notes.filter(note => /peça de novo/u.test(note))).toHaveLength(1)
  // asking again twice does not tell the persona twice
  h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'retry' })
  expect(notes.filter(note => /peça de novo/u.test(note))).toHaveLength(1)
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([])
  // the persona asks with the same arguments: a NEW card, pending, with a new deadline
  const fresh = h.externalActions.record(request(ticketId))!
  expect(fresh.id).not.toBe(doc.id)
  expect(fresh.status).toBe('pending')
  expect(Date.parse(fresh.expiresAt)).toBeGreaterThan(Date.parse(doc.expiresAt))
})

it('Pedir de novo does not count as a new attempt: the limit of 2 still stops a persona that keeps changing the call', () => {
  const { h, ticketId } = open()
  const first = h.externalActions.record(request(ticketId, { argsHash: '1'.repeat(64) }))!
  pass24h(h)
  h.decideApproval({ ...SCOPE, id: first.id, kind: 'action', choice: 'retry' })
  expect(h.externalActions.record(request(ticketId, { argsHash: '1'.repeat(64) }))).toBeDefined() // the retry
  expect(h.externalActions.record(request(ticketId, { argsHash: '2'.repeat(64) }))).toBeDefined() // the 2nd attempt
  expect(h.externalActions.record(request(ticketId, { argsHash: '3'.repeat(64) }))).toBeUndefined() // the 3rd is stopped
})

it('Pedir de novo on a card that was sent or cancelled changes nothing', () => {
  const { h, notes, ticketId } = open()
  const sent = h.externalActions.record(request(ticketId, { argsHash: '4'.repeat(64) }))!
  h.decideApproval({ ...SCOPE, id: sent.id, kind: 'action', choice: 'send' })
  h.externalActions.markSent('pp', sent.id)
  expect(h.decideApproval({ ...SCOPE, id: sent.id, kind: 'action', choice: 'retry' }).actionPreview?.status).toBe('sent')
  const cancelled = h.externalActions.record(request(ticketId, { argsHash: '5'.repeat(64) }))!
  h.decideApproval({ ...SCOPE, id: cancelled.id, kind: 'action', choice: 'cancel' })
  expect(h.decideApproval({ ...SCOPE, id: cancelled.id, kind: 'action', choice: 'retry' }).actionPreview).toMatchObject({ status: 'cancelled' })
  expect(notes.some(note => /peça de novo/u.test(note))).toBe(false)
})

it('executes exactly what was approved, once: a second Enviar approves nothing and the card is sent a single time', () => {
  const { h, ticketId } = open()
  const seen: string[] = []
  h.onActionApproved = (action) => { seen.push(action.argsHash) }
  const doc = h.externalActions.record(request(ticketId))!
  h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' })
  h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' }) // a double hold / a replayed request
  expect(seen).toEqual(['a'.repeat(64)])
  expect(h.externalActions.approvedFor('pp', ticketId)).toHaveLength(1)
  h.externalActions.markSent('pp', doc.id)
  h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' })
  expect(seen).toHaveLength(1)
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([])
  expect(cards(h).filter(card => card.actionPreview?.status === 'sent')).toHaveLength(1)
})

it('a call with other arguments is not what was approved: the approval is by the hash and does not cover it', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' })
  const approved = h.externalActions.approvedFor('pp', ticketId)
  expect(approved).toEqual([{ tool: 'mcp__gmail__send_email', argsHash: 'a'.repeat(64) }])
  expect(approved.some(row => row.argsHash === 'b'.repeat(64))).toBe(false)
})

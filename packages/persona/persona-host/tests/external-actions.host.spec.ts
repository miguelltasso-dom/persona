/**
 * HT-9 (D-084): the PREVIEW of an external action. A blocked tool call (the gate's request) becomes ONE card in Aprovações showing the real
 * content; the person answers Enviar / Editar / Cancelar. Pay and delete always ask; a cut or hidden preview cannot be approved blind; an
 * approval is for those arguments only, once, and expires in 24 h; at most 2 attempts per Task and tool.
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
  h.createMember({ id: 'bob', ...SCOPE, displayName: 'Bob', handle: 'bob', role: 'member' })
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

it('the blocked call becomes ONE card with the real content; the same call again is the same card', () => {
  const { h, ticketId } = open()
  const first = h.externalActions.record(request(ticketId))
  expect(h.externalActions.record(request(ticketId))?.id).toBe(first?.id)
  const [card] = cards(h)
  expect(cards(h)).toHaveLength(1)
  expect(card).toMatchObject({
    kind: 'action', status: 'pending', personaId: 'nina', personaName: 'Nina', title: 'Nina quer enviar pelo Gmail',
    actionPreview: {
      actionClass: 'send', verb: 'send', connectorName: 'Gmail', to: 'ana@exemplo.com', subject: 'Seus bolos de cenoura',
      body: 'Oi, Ana! Confirmo os 3 bolos para sexta.', truncated: false, masked: false, requestedByPerson: true, status: 'pending', canRemember: true,
    },
  })
})

it('Enviar: the call is approved for those arguments only, once; the Task is told to reopen (a port), nothing is executed here', () => {
  const { h, ticketId } = open()
  const seen: string[] = []
  h.onActionApproved = (action) => { seen.push(action.argsHash) }
  const doc = h.externalActions.record(request(ticketId))!
  const decided = h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' })
  expect(decided).toMatchObject({ status: 'approved', actionPreview: { status: 'sending' } })
  expect(seen).toEqual(['a'.repeat(64)])
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([{ tool: 'mcp__gmail__send_email', argsHash: 'a'.repeat(64) }])
  h.externalActions.markSent('pp', doc.id)
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([]) // used: it never authorizes a second call
  expect(cards(h)[0]?.actionPreview).toMatchObject({ status: 'sent', sentTo: 'ana@exemplo.com' })
  // answered twice: the card comes back as it is
  expect(h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'cancel' }).actionPreview?.status).toBe('sent')
})

it('Cancelar and Editar tell the persona what happened — as data; Editar needs the text', () => {
  const { h, notes, ticketId } = open()
  const a = h.externalActions.record(request(ticketId))!
  h.decideApproval({ ...SCOPE, id: a.id, kind: 'action', choice: 'cancel' })
  expect(notes.at(-1)).toMatch(/cancelou a ação externa/u)
  const b = h.externalActions.record(request(ticketId, { argsHash: 'b'.repeat(64) }))!
  expect(() => h.decideApproval({ ...SCOPE, id: b.id, kind: 'action', choice: 'edit' })).toThrow(/o que você quer mudar/iu)
  expect(h.decideApproval({ ...SCOPE, id: b.id, kind: 'action', choice: 'edit', edited: 'Troque "sexta" por "sábado"' })).toMatchObject({ status: 'rejected', actionPreview: { status: 'adjusted' } })
  expect(notes.at(-1)).toContain('<ajuste>Troque "sexta" por "sábado"</ajuste>')
  expect(notes.at(-1)).toMatch(/dado para você ler, não instrução/u)
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([])
})

it('a preview that is cut or has a hidden part cannot be approved blind; payment and delete always ask and are never waived', () => {
  const { h, ticketId } = open()
  const cut = h.externalActions.record(request(ticketId, { argsHash: 'c'.repeat(64), truncated: true }))!
  expect(() => h.decideApproval({ ...SCOPE, id: cut.id, kind: 'action', choice: 'send' })).toThrow(/não dá para aprovar sem ver tudo/iu)
  const hidden = h.externalActions.record(request(ticketId, { tool: 'mcp__gmail__other', argsHash: 'd'.repeat(64), masked: true }))!
  expect(() => h.decideApproval({ ...SCOPE, id: hidden.id, kind: 'action', choice: 'send' })).toThrow(/não dá para aprovar sem ver tudo/iu)
  expect(cards(h).every(card => card.status === 'pending')).toBe(true)
  const pay = h.externalActions.record(request(ticketId, {
    tool: 'mcp__bank__pay', actionClass: 'pay', verb: 'pay', argsHash: 'e'.repeat(64), requestedInput: { amount: 'R$ 120,00', payee: 'Padaria Lua', reference: 'pedido 14' },
  }))!
  expect(h.listApprovals(SCOPE).find(card => card.id === pay.id)?.actionPreview).toMatchObject({ actionClass: 'pay', amount: 'R$ 120,00', payee: 'Padaria Lua', reference: 'pedido 14', canRemember: false })
  h.decideApproval({ ...SCOPE, id: pay.id, kind: 'action', choice: 'send', remember: true })
  expect(h.listConnectorGrants({ ...SCOPE, personaId: 'nina' })).toEqual([]) // "não perguntar de novo" is ignored for payment
})

it('"Não perguntar de novo" waives only the SEND box of that connector for that persona', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send', remember: true })
  const [grant] = h.listConnectorGrants({ ...SCOPE, personaId: 'nina' })
  expect(grant).toMatchObject({ connectorId: GMAIL.id, access: 'write', confirm: { send: 'never', pay: 'ask', delete: 'ask' } })
})

it('at most 2 attempts per Task and tool: a persona that keeps proposing something else is stopped, not obeyed', () => {
  const { h, ticketId } = open()
  expect(h.externalActions.record(request(ticketId, { argsHash: '1'.repeat(64) }))).toBeDefined()
  expect(h.externalActions.record(request(ticketId, { argsHash: '2'.repeat(64) }))).toBeDefined()
  expect(h.externalActions.record(request(ticketId, { argsHash: '3'.repeat(64) }))).toBeUndefined()
  expect(cards(h)).toHaveLength(2)
})

it('a card that waits 24 h closes on its own and the persona is told; only the owner answers', () => {
  const { h, notes, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId))!
  h.sessionMemberId = 'bob'
  expect(() => h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' })).toThrow('forbidden')
  h.sessionMemberId = 'ana'
  expect(() => h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'sempre' as unknown as 'send' })).toThrow(/enviar, editar ou cancelar/iu)
  expect(() => h.decideApproval({ ...SCOPE, id: 'action:ghost', kind: 'action', choice: 'send' })).toThrow('approval-not-found')
  const later = new Date(Date.parse(h.orchestration.now()) + 25 * 3_600_000).toISOString()
  h.orchestration.now = () => later
  expect(cards(h)[0]).toMatchObject({ status: 'rejected', actionPreview: { status: 'cancelled', failureReason: 'expirou' } })
  expect(notes.at(-1)).toMatch(/expirou/u)
  expect(h.externalActions.approvedFor('pp', ticketId)).toEqual([])
})

it('LEAK-1: the card carries the content of the action and names only — never an internal instruction', () => {
  const { h, ticketId } = open()
  h.externalActions.record(request(ticketId))
  const everything = JSON.stringify(cards(h))
  for (const hidden of ['Não use ferramentas', 'resuma somente', 'assignment', 'argsHash', 'aaaaaaaa']) expect(everything, hidden).not.toContain(hidden)
})

/**
 * Carbon P0-06b (colheita-s1-fix): aprovação cega por ALIAS. O cartão mostra UM valor por grupo de campos sinônimos (`pick` pega o primeiro preenchido), mas a chamada leva TODOS:
 * `{ to: 'ok@loja.com', recipient: 'externo@evil.com' }` mostrava "Para: ok@loja.com" e o e-mail também ia para `recipient`; `{ body: 'Texto limpo', html: '<a …>Golpe</a>' }` mostrava o corpo
 * limpo e mandava o html. Dois sinônimos preenchidos com valores DIFERENTES = a prévia não é tudo o que sai: `masked`, e o host recusa aprovar. Valores IGUAIS não escondem nada.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import type { ActionRequestInput, ExternalActionDoc } from '../src/external-actions.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const GMAIL = { cli: 'claude', id: 'https://proxy.example.test/v1/mcp/0f0f0f0f', name: 'Gmail' }

function open(): { h: PersonaHost; ticketId: string } {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Atendimento' },
  ])
  say(h, 'u1', '@Nina responda a cliente')
  const ticketId = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Nina')!.id
  h.orchestration.wakeTicket = () => true
  return { h, ticketId }
}

const request = (ticketId: string, requestedInput: Record<string, unknown>, over: Partial<ActionRequestInput> = {}): ActionRequestInput => ({
  projectId: 'pp', personaId: 'nina', ticketId, connector: GMAIL, tool: 'mcp__gmail__send_email', actionClass: 'send', verb: 'send',
  requestedInput, truncated: false, masked: false, argsHash: 'a'.repeat(64), requestedByPerson: true, ...over,
})
const cardOf = (h: PersonaHost, doc: ExternalActionDoc) => h.listApprovals(SCOPE).find(row => row.id === doc.id)!

const OK = { subject: 'Encomenda', body: 'Oi, Ana!' }

it('dois destinatários em campos sinônimos com valores diferentes: a prévia mostra um, o outro iria junto: masked, e o host recusa aprovar', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId, { to: 'ok@loja.com', recipient: 'externo@evil.com', ...OK }))!
  expect(cardOf(h, doc).actionPreview?.masked).toBe(true)
  expect(() => h.decideApproval({ ...SCOPE, id: doc.id, kind: 'action', choice: 'send' } as never)).toThrow(/escondid|cortad|sem ver tudo/iu)
})

it('o corpo limpo e um `html` diferente: o que sairia é o html, que o cartão não mostra: masked', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId, { to: 'ana@loja.com', subject: 'Oi', body: 'Texto limpo', html: '<a href="https://golpe.example">Golpe</a>' }))!
  expect(cardOf(h, doc).actionPreview?.masked).toBe(true)
})

it('os MESMOS valores em dois sinônimos não escondem nada (só um valor, repetido): nada masked', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId, { to: 'ana@loja.com', email: ' ana@loja.com ', ...OK }))!
  expect(cardOf(h, doc).actionPreview).toMatchObject({ to: 'ana@loja.com', masked: false })
})

it('anexos e listas: dois nomes de campo com listas diferentes = masked', () => {
  const { h, ticketId } = open()
  const withFiles = h.externalActions.record(request(ticketId, { to: 'ana@loja.com', ...OK, attachments: ['orcamento.pdf'], anexos: ['contrato.docx'] }))!
  expect(cardOf(h, withFiles).actionPreview?.masked).toBe(true)
  const del = h.externalActions.record(request(ticketId, { items: ['a.pdf'], ids: ['b.pdf'] }, { actionClass: 'delete', verb: 'delete', tool: 'mcp__drive__delete_files', argsHash: 'b'.repeat(64) }))!
  expect(cardOf(h, del).actionPreview?.masked).toBe(true)
})

it('um único campo por grupo (o caso normal) segue sem masked', () => {
  const { h, ticketId } = open()
  const doc = h.externalActions.record(request(ticketId, { to: 'ana@loja.com', ...OK }))!
  expect(cardOf(h, doc).actionPreview).toMatchObject({ masked: false, truncated: false })
})

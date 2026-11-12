// Era RED (Gauge → Keel, 12/11 03:15); consertado no Carbon P0-13 (Tally): agora é spec normal. A Tarefa nascida de uma DM mostra título/contexto só aos participantes da DM.
import { expect } from 'vitest'
import { it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * SEÇÃO 11 #4 "DM derivada em resumo" / #3 "amigo sem acesso": "Nenhuma DM ou derivação chega ao amigo" (arquitetura, etapa E).
 * Medido 03:10 num projeto compartilhado: a Ana pede à Bia, NA DM, "escreva a lista do cliente e guarde o segredo-da-ana-5521". A Tarefa que nasce da DM guarda o texto da DM como título,
 * e um MEMBRO que NÃO é do DM (o Bob) lê esse texto por DOIS Remotes:
 *   - `getProjectBoard`: o cartão da tarefa traz o título (texto da DM);
 *   - `getTurnContext({ ticketId })`: devolve título + contexto usado do turno da tarefa.
 * A DM em si, a busca, a memória, o cérebro e o contexto usado da mensagem JÁ respeitam o DM (ver mandatory-integration.host.spec.ts). Falta o mesmo para o que é DERIVADO.
 * Esperado: o cartão da tarefa de uma DM não aparece (ou aparece sem o texto) para quem não é do DM, e getTurnContext recusa/esvazia para quem não é do DM.
 */
const SP = { workspaceId: 'ws', projectId: 'sp' } as const
const SECRET = 'segredo-da-ana-5521'

async function derivedFromDm() {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, [])
  seedProject(h, { id: 'sp', name: 'Equipe', team: [{ id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true }, { id: 'bia', name: 'Bia', title: 'Redação' }] })
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('sp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  h.createMember({ id: 'bob', ...SP, displayName: 'Bob', handle: 'bob', role: 'member' })
  h.createDm({ id: 'dm-ab', ...SP, participantA: 'ana', participantB: 'bia' })
  const queue = [`Anotado: guardei o ${SECRET}.`]
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => queue.shift(), set: () => undefined })
  h.postMessage({ id: 'd1', ...SP, streamKind: 'dm', ownerId: 'dm-ab', body: `Bia, escreva a lista do cliente e guarde o ${SECRET}`, actorId: 'ana', subjectId: 'd1' })
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('sp')
  const ticket = h.orchestration.runtime('sp').repo.tickets.list().find(row => row.execution?.name === 'Bia')
  if (ticket === undefined) throw new Error('a DM não abriu Tarefa')
  return { h, ticket }
}

it('RED 1: o quadro não mostra a quem não é do DM o texto de uma tarefa nascida da DM', async () => {
  const { h } = await derivedFromDm()
  h.sessionMemberId = 'bob'
  let seen = ''
  try { seen = JSON.stringify(h.getProjectBoard(SP)) } catch { /* recusado = não vazou */ }
  expect(seen.includes(SECRET)).toBe(false)
})

it('RED 2: getTurnContext de uma tarefa nascida da DM não devolve o texto da DM a quem não é do DM', async () => {
  const { h, ticket } = await derivedFromDm()
  h.sessionMemberId = 'bob'
  let seen = ''
  try { seen = JSON.stringify(h.getTurnContext({ ...SP, ticketId: ticket.id } as never)) } catch { /* recusado = não vazou */ }
  expect(seen.includes(SECRET)).toBe(false)
})

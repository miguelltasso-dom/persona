import { expect } from 'vitest'
import { it, openJourney, seedJourney, seedProject } from './journeys/journey-host.ts'

/**
 * Carbon P0-13 (Keel 05:08): what is DERIVED from a DM does not reach the others through the screens that WRITE into the shared channel. A Task born in a DM carries the DM's words as its title:
 * the morning card (a message of #geral, read by every member) must say "Tarefa de uma conversa privada", never the title.
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

it('the morning card (a message of the shared #geral) never carries the title of a Task born in a DM', async () => {
  const { h, ticket } = await derivedFromDm()
  expect(ticket.title.length, 'the Task has a title made of the DM words').toBeGreaterThan(0)
  const posted = h.postDailyBriefNow({ ...SP, requestId: 'r1' })
  expect(posted.outcome, 'the card was written (otherwise this test proves nothing)').toBe('posted')
  const channel = h.product.listChannels('sp').find(row => row.name === 'geral')
  if (channel === undefined) throw new Error('no #geral')
  h.sessionMemberId = 'bob'
  const lines = h.listMessages({ ...SP, streamKind: 'channel', ownerId: channel.id, actorId: 'bob', afterSeq: 0, limit: 200 }).events
  const card = lines.find(row => row.id.startsWith('morning-brief:'))
  expect(card, 'the card is in #geral').toBeDefined()
  const seen = JSON.stringify(lines)
  expect(seen.includes(SECRET)).toBe(false)
  expect(seen.includes(ticket.title), `the card shows the title "${ticket.title}"`).toBe(false)
})

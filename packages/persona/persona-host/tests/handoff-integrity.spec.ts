/**
 * INTEGRITY of the handoff lines (Gauge, TEAM-9 rehearsal, 04/11 22:35): "Bia passou para Teo" was stored with the PERSON as its author.
 * The person never wrote that: nothing in her name that she did not say (D-079 / LEAK-1). The contract proven here:
 *  - every handoff line (asked, delivered, …) is authored by the PERSONA it is about, in the stored event AND in what the thread returns;
 *  - the colleague's Task still inherits the person's scope: the mandate comes from the route, not from the author of the line;
 *  - everything authored by the person is only what she wrote.
 */
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

const NOTE = { done: ['Texto dos 3 posts pronto.'], needed: ['Arte para cada post'], files: ['posts/post-1.md'], decisions: ['Tom leve'] }

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = true
  // These specs are about asking a colleague: the review step (on by default in a new project) has its own spec (review-step.host.spec.ts).
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const thread = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const personaIds = (h: PersonaHost): string[] => h.product.listPersonas('pp').map(persona => persona.id)

it('the asked line is written by the asking persona, the Task of the colleague keeps the person\'s mandate', async () => {
  const h = open()
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  const bia = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Bia')!
  const result = h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts', note: NOTE, callId: 'c1' })
  expect(result).toMatchObject({ ok: true, status: 'asked' })
  const line = thread(h).find(row => row.handoff !== undefined)!
  expect(line.actorId).toBe('bia') // what the thread returns
  expect(h.events.get(line.id)?.actorId).toBe('bia') // what is stored (it also travels to the other desks of a remote team)
  const teo = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Teo')!
  expect(teo, 'the persona-authored line still opens the colleague\'s Task').toBeDefined()
  expect(teo.mandate.actor).toEqual(bia.mandate.actor) // the person's scope, no more
  expect(teo.mandate.actor.id).toBe('ana')
  await h.orchestration.flush('pp')
})

it('the delivered line is written by the colleague who delivered; the person authors only what she wrote', async () => {
  const h = open()
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  const bia = h.orchestration.runtime('pp').repo.tickets.list().find(ticket => ticket.execution?.name === 'Bia')!
  h.handoffs.ask({ projectId: 'pp', fromTicketId: bia.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts', note: NOTE, callId: 'c1' })
  await h.orchestration.flush('pp')
  await h.orchestration.flush('pp')
  const lines = thread(h).filter(row => row.handoff !== undefined)
  expect(lines.map(row => `${row.handoff?.status}:${row.actorId}`)).toEqual(['asked:bia', 'delivered:teo', 'resumed:bia'])
  for (const row of lines) expect(personaIds(h)).toContain(row.actorId) // never the person
  // the person wrote one line; nothing typed by the system carries her name
  const hers = h.events.listProject('pp').filter(event => event.actorId === 'ana').map(event => event.body)
  expect(hers).toEqual(['@Bia escreva os 3 posts da campanha'])
})

it('a persona-authored line does not wake anyone on its own: only the host route that carries a mandate opens a Task', () => {
  const h = open()
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  const before = h.orchestration.runtime('pp').repo.tickets.list().length
  // the same line written by a persona WITHOUT a route (e.g. a persona typing a handoff-looking message) opens nothing
  h.events.append({
    id: 'fake-handoff', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'Bia pediu ajuda a Teo: fazer tudo', actorId: 'bia', subjectId: 'fake', occurredAt: '2026-11-04T12:00:00.000Z',
  })
  h.orchestration.ingest(h.events.get('fake-handoff')!, 'channel', 'geral', '')
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(before)
})

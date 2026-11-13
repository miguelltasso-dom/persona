import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { TurnRunner } from '@deepseek-ai/dsh-persona-runners'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { createRemoteRunnerOf, isRemoteDmPrivateError } from '../src/computers/remote-home-hook.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * D-116 executor, Lumen's review of the dm-private gate (22:12): a Task that a colleague opens by a HANDOFF from a Task born in a DM is born in that DM too (the request is written in the same stream as its origin), so the
 * gate refuses to send it to another computer; the same handoff from a Task born in a channel goes to her home. The proof is the real host's `handoffs.ask` and `conversationOfTicket`.
 */
const NOTE = { done: ['Texto dos 3 posts pronto.'], needed: ['Arte para cada post'], files: ['posts/post-1.md'], decisions: ['Tom leve'] }
const runner = { tag: 'runner-de-B' } as unknown as TurnRunner

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'bia', name: 'Bia', title: 'Redação' },
    { id: 'teo', name: 'Teo', title: 'Arte' },
  ])
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()
const ticketOf = (h: PersonaHost, name: string): Ticket | undefined => tickets(h).find(ticket => ticket.execution?.name === name)
const ask = (h: PersonaHost, from: Ticket) => h.handoffs.ask({ projectId: 'pp', fromTicketId: from.id, fromPersonaId: 'bia', toPersonaId: 'teo', title: 'Arte dos 3 posts', note: NOTE, callId: 'c1' })
const hookOf = (h: PersonaHost) => createRemoteRunnerOf({
  turns: () => ({ isRemote: personaId => personaId === 'teo', runnerFor: () => runner }),
  conversationOf: (projectId, ticketId) => h.orchestration.conversationOfTicket(projectId, ticketId),
})
const spec = { kind: 'cli', cli: 'claude', model: 'haiku' } as const

it('a Task opened by handoff from a Task born in a DM is born in that DM: it never goes to another computer', () => {
  const h = open()
  h.createDm({ id: 'dm-bia', ...SCOPE, participantA: 'ana', participantB: 'bia' })
  h.postMessage({ id: 'u-dm', ...SCOPE, streamKind: 'dm', ownerId: 'dm-bia', body: 'Bia, escreva os 3 posts da campanha, só entre nós', actorId: 'ana', subjectId: 'u-dm' })
  const bia = ticketOf(h, 'Bia')
  if (bia === undefined) throw new Error('Bia has no Task from the DM')
  expect(h.orchestration.conversationOfTicket('pp', bia.id)?.streamKind, 'control: the origin is a DM').toBe('dm')
  expect(ask(h, bia)).toMatchObject({ ok: true })
  const teo = ticketOf(h, 'Teo')
  if (teo === undefined) throw new Error('Teo has no Task from the handoff')
  expect(h.orchestration.conversationOfTicket('pp', teo.id)?.streamKind, 'the child was born in the same DM').toBe('dm')
  let caught: unknown
  try { hookOf(h)('teo', spec, { projectId: 'pp', ticketId: teo.id }) } catch (error) { caught = error }
  expect(isRemoteDmPrivateError(caught), 'the gate refuses it before anything is sent').toBe(true)
})

it('control: the same handoff from a Task born in a channel goes to her home', () => {
  const h = open()
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  const bia = ticketOf(h, 'Bia')
  if (bia === undefined) throw new Error('Bia has no Task')
  expect(ask(h, bia)).toMatchObject({ ok: true })
  const teo = ticketOf(h, 'Teo')
  if (teo === undefined) throw new Error('Teo has no Task from the handoff')
  expect(h.orchestration.conversationOfTicket('pp', teo.id)?.streamKind).toBe('channel')
  expect(hookOf(h)('teo', spec, { projectId: 'pp', ticketId: teo.id })).toBe(runner)
})

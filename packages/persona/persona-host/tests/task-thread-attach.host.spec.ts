import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Item 18, attachments in the thread (staging until the freeze ends): a file the person attaches in the Task's conversation goes by the same path as in any chat (`attachFile` + `attachmentIds` on
 * the message), stays with the thread's message and is never listed in the main timeline.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
]
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function rig(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

async function taskOfBia(h: PersonaHost): Promise<Ticket> {
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => 'Os posts estão prontos.', set: () => undefined })
  say(h, 'u1', '@Bia escreva os posts da campanha')
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.execution?.name === 'Bia')
  if (ticket === undefined) throw new Error('no Task')
  return ticket
}

const read = (h: PersonaHost, topicId?: string) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200, ...(topicId === undefined ? {} : { topicId }) }).events

it('a file attached in the Task\'s conversation stays with the thread message (the same attach path as any chat) and never shows in the main timeline', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  const file = h.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name: 'cartaz.png', bytesBase64: PNG })
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => 'Recebi o cartaz.', set: () => undefined })
  h.postMessage({ id: 'a1', ...SCOPE, streamKind: 'channel', ownerId: 'geral', body: 'olha esse cartaz', actorId: 'ana', subjectId: 'a1', topicId, attachmentIds: [file.id] })
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
  const mine = read(h, topicId).find(row => row.id === 'a1')
  expect(mine?.attachmentIds).toEqual([file.id])
  expect(read(h).some(row => row.id === 'a1')).toBe(false)
  expect(read(h).some(row => row.attachmentIds.includes(file.id))).toBe(false)
})

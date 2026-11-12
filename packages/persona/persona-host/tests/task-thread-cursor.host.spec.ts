import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Item 18, the cursor of a thread (Gauge's attack, 12/11): a thread has no ceiling, so what the card carries (count, unread, last seq) must stay true as it grows past one page, and the read
 * cursor can never be set into the future (it would silence the thread for good).
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
]

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
  Object.defineProperty(h.orchestration, 'liveText', { configurable: true, get: () => undefined, set: () => undefined })
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.execution?.name === 'Bia')
  if (ticket === undefined) throw new Error('no Task')
  return ticket
}

const card = (h: PersonaHost, ticketId: string) => h.getProjectBoard(SCOPE).cards.find(row => row.ticketId === ticketId)
let serial = 0
/** A message of the persona written straight into the thread (what her answers are), without running a turn. */
const answer = (h: PersonaHost, topicId: string): void => {
  serial += 1
  h.events.append({
    id: `bulk-${String(serial)}`, workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: `resposta ${String(serial)}`, actorId: 'bia', subjectId: '', occurredAt: '2026-11-12T12:00:00.000Z', topicId,
  })
}

it('a thread past one page keeps counting: the count, the unread and the last seq stay true, and a new message is unread again after the person read everything', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  for (let at = 0; at < 250; at += 1) answer(h, topicId)
  const before = card(h, bia.id)
  expect(before).toMatchObject({ threadCount: 250, threadUnread: 250 })
  expect(h.markTaskThreadRead({ ...SCOPE, ticketId: bia.id, seq: before?.threadLastSeq ?? 0 })).toBe(true)
  expect(card(h, bia.id)).toMatchObject({ threadCount: 250, threadUnread: 0 })
  answer(h, topicId)
  const after = card(h, bia.id)
  expect(after).toMatchObject({ threadCount: 251, threadUnread: 1 }) // not stuck at the 200th message
  expect(after?.threadLastSeq).toBeGreaterThan(before?.threadLastSeq ?? 0)
})

it('the read cursor never goes into the future: a huge seq reads up to the last message that exists, and the next answer is unread', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  for (let at = 0; at < 3; at += 1) answer(h, topicId)
  expect(h.markTaskThreadRead({ ...SCOPE, ticketId: bia.id, seq: 1_000_000 })).toBe(true)
  expect(card(h, bia.id)).toMatchObject({ threadCount: 3, threadUnread: 0 })
  answer(h, topicId)
  expect(card(h, bia.id)).toMatchObject({ threadCount: 4, threadUnread: 1 }) // the answer that came after is NOT silenced
  // an empty thread: nothing to read, nothing stored
  const empty = rig()
  const task = await taskOfBia(empty)
  expect(empty.markTaskThreadRead({ ...SCOPE, ticketId: task.id, seq: 999 })).toBe(true)
  answer(empty, empty.openTaskConversation({ ...SCOPE, ticketId: task.id }).topicId)
  expect(card(empty, task.id)).toMatchObject({ threadCount: 1, threadUnread: 1 })
})

import { expect } from 'vitest'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Item 18 (colheita): the conversation of a Task is a REAL thread of chat in the card of the board. Open a card and talk to the team about THAT Task: the message goes to the persona that takes care
 * of it (or to the one the message names), her answer arrives in the Task's thread and not in #geral, with the paths that already exist (post / list / follow with a topic, attachments, the reply
 * stream) — no second chat. The card carries the count and the unread of its thread.
 */
const TEAM = [
  { id: 'lia', name: 'Lia', title: 'Coordenação', coordination: true },
  { id: 'bia', name: 'Bia', title: 'Redação' },
  { id: 'teo', name: 'Teo', title: 'Arte' },
]

function rig(): PersonaHost {
  const h = openJourney('2026-11-12T12:00:00.000Z')
  seedJourney(h, TEAM)
  h.sessionMemberId = 'ana'
  h.teamworkEnabled = true
  h.screens.screens.put('pp', 'review_policy', 'v1', { mode: 'off', reviewer: { kind: 'coordination' } })
  return h
}

function script(h: PersonaHost, steps: ReadonlyArray<string | (() => string)>): void {
  const queue = [...steps]
  Object.defineProperty(h.orchestration, 'liveText', {
    configurable: true,
    get: () => { const next = queue.shift(); return typeof next === 'function' ? next() : next },
    set: () => undefined,
  })
}

async function settle(h: PersonaHost): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await h.orchestration.flush('pp')
}

/** A Task of Bia that is already delivered (the card exists and has its thread to open). */
async function taskOfBia(h: PersonaHost): Promise<Ticket> {
  script(h, ['Os 3 posts estão prontos.'])
  say(h, 'u1', '@Bia escreva os 3 posts da campanha')
  await settle(h)
  const ticket = h.orchestration.runtime('pp').repo.tickets.list().find(row => row.execution?.name === 'Bia')
  if (ticket === undefined) throw new Error('no Task')
  return ticket
}

const read = (h: PersonaHost, topicId?: string) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200, ...(topicId === undefined ? {} : { topicId }) }).events
const card = (h: PersonaHost, ticketId: string) => h.getProjectBoard(SCOPE).cards.find(row => row.ticketId === ticketId)
const write = (h: PersonaHost, id: string, body: string, topicId: string) => h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: 'geral', body, actorId: 'ana', subjectId: id, topicId })

it('the card opens its conversation: the stream, the topic of the Task, its title and who takes care of it (idempotent; an unknown Task is refused)', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const opened = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  expect(opened).toEqual({ streamKind: 'channel', ownerId: 'geral', topicId: `task:${bia.id}`, title: bia.title, caring: [{ personaId: 'bia', name: 'Bia' }] })
  expect(h.openTaskConversation({ ...SCOPE, ticketId: bia.id })).toEqual(opened)
  expect(() => h.openTaskConversation({ ...SCOPE, ticketId: 'nao-existe' })).toThrow(/não encontrada/u)
  // nothing was written by opening it
  expect(read(h, opened.topicId)).toHaveLength(0)
})

it('talk to the team about the Task: the message goes to who takes care of it (no @ needed) and her answer stays in the Task\'s thread — never in #geral', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  const mainBefore = read(h).map(row => row.id)
  script(h, ['Está quase tudo certo; falta só rever o terceiro post.'])
  write(h, 'q1', 'como está ficando?', topicId)
  await settle(h)
  const thread = read(h, topicId)
  expect(thread.map(row => row.actorId)).toEqual(['ana', 'bia']) // the person's question and HER answer, in order
  expect(thread[1]?.body).toBe('Está quase tudo certo; falta só rever o terceiro post.')
  expect(thread.every(row => row.topicId === topicId)).toBe(true)
  // #geral did not get either of them: the main timeline is the same as before
  expect(read(h).map(row => row.id)).toEqual(mainBefore)
  expect(read(h).some(row => row.body.includes('quase tudo certo'))).toBe(false)
})

it('@persona in the thread calls that persona, who answers in the thread', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  script(h, ['Vi sim: a arte combina com o texto.'])
  write(h, 'q1', '@Teo você viu o texto dos posts?', topicId)
  await settle(h)
  expect(read(h, topicId).map(row => row.actorId)).toEqual(['ana', 'teo'])
  expect(read(h).some(row => row.actorId === 'teo')).toBe(false)
})

it('the persona reads the brief of THAT Task (title, who cares, situation) as context of her answer', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  const event = { projectId: 'pp', topicId } as never
  const context = h.orchestration.threadContextOf?.(event) ?? []
  expect(context).toHaveLength(1)
  expect(context[0]?.body).toContain(`“${bia.title}”`)
  expect(context[0]?.body).toContain('de quem cuida Bia')
  expect(context[0]?.body).toContain('Os 3 posts estão prontos.') // her own last report, as data
  expect(h.orchestration.threadContextOf?.({ projectId: 'pp', topicId: 'u1' } as never)).toEqual([]) // a message outside a thread carries none
})

it('the card carries the thread: how many messages, how many the person has not read, the last seq; reading it clears the unread', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  expect(card(h, bia.id)).toMatchObject({ threadTopicId: topicId, threadCount: 0, threadUnread: 0, threadLastSeq: 0 })
  script(h, ['Falta só rever o terceiro post.'])
  write(h, 'q1', 'como está ficando?', topicId)
  await settle(h)
  const after = card(h, bia.id)
  expect(after).toMatchObject({ threadTopicId: topicId, threadCount: 2, threadUnread: 1 }) // her answer is unread; the person's own message never is
  expect(after?.threadLastSeq).toBeGreaterThan(0)
  expect(h.markTaskThreadRead({ ...SCOPE, ticketId: bia.id, seq: after?.threadLastSeq ?? 0 })).toBe(true)
  expect(card(h, bia.id)).toMatchObject({ threadCount: 2, threadUnread: 0 })
  // never backwards: an older cursor does not bring the unread back
  h.markTaskThreadRead({ ...SCOPE, ticketId: bia.id, seq: 1 })
  expect(card(h, bia.id)?.threadUnread).toBe(0)
  expect(() => h.markTaskThreadRead({ ...SCOPE, ticketId: bia.id, seq: -1 })).toThrow()
  expect(() => h.markTaskThreadRead({ ...SCOPE, ticketId: 'nao-existe', seq: 1 })).toThrow(/não encontrada/u)
})

it('the follow of the thread carries only its messages, and the follow of the stream never carries them', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  script(h, ['Falta só rever o terceiro post.'])
  write(h, 'q1', 'como está ficando?', topicId)
  await settle(h)
  const first = async (topic?: string): Promise<readonly string[]> => {
    const controller = new AbortController()
    for await (const frame of h.followMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200, ...(topic === undefined ? {} : { topicId: topic }) }, controller.signal)) {
      controller.abort()
      return frame.events.map(row => row.id)
    }
    return []
  }
  const thread = await first(topicId)
  expect(thread).toContain('q1')
  expect(thread.every(id => id === 'q1' || read(h, topicId).some(row => row.id === id))).toBe(true)
  const mainIds = await first()
  expect(mainIds).not.toContain('q1')
  expect(mainIds.some(id => read(h, topicId).some(row => row.id === id))).toBe(false)
})

it('a message of the thread is only written in the stream of its Task (never in another conversation under the Task\'s topic)', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  expect(() => h.postMessage({ id: 'x1', ...SCOPE, streamKind: 'channel', ownerId: 'outro-canal', body: 'oi', actorId: 'ana', subjectId: 'x1', topicId })).toThrow(/outra tarefa/u)
  expect(() => write(h, 'x2', 'oi', 'task:nao-existe')).toThrow(/não existe mais/u)
})

it('asking for an adjustment in the thread is the SAME Task talking: no second card is opened, and the answer stays in the thread', async () => {
  const h = rig()
  const bia = await taskOfBia(h)
  const { topicId } = h.openTaskConversation({ ...SCOPE, ticketId: bia.id })
  script(h, ['Ajustei o terceiro post.'])
  write(h, 'w1', 'Bia, ajuste o terceiro post para ficar mais curto', topicId)
  await settle(h)
  expect(h.orchestration.runtime('pp').repo.tickets.list()).toHaveLength(1)
  expect(read(h, topicId).map(row => `${row.actorId}: ${row.body}`)).toEqual(['ana: Bia, ajuste o terceiro post para ficar mais curto', 'bia: Ajustei o terceiro post.'])
  expect(read(h).some(row => row.body.includes('Ajustei o terceiro post.'))).toBe(false)
})

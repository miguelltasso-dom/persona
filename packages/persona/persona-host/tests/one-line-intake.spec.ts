import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Intake side of the "one message = one line" contract (P0, 04/11 21:40): whatever the host does with a message afterwards (a chat
 * reply, a Ticket, a deferral for an engine, a structured question and its answer), the person's words are ONE line in the thread.
 * (The real-runner-path half lives in `one-message-one-line.spec.ts`.)
 */

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
  ])
  return h
}

const lines = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const ofPerson = (h: PersonaHost, body: string) => lines(h).filter(row => row.actorId === 'ana' && row.body === body)

it('a chat message, a work request, a mention and a question each stay ONE line from the person', async () => {
  const h = open()
  const texts = ['oi, tudo bem?', 'preciso de um README no projeto', '@Nina monte o cardápio novo', 'qual é o horário da loja?']
  for (const [index, text] of texts.entries()) {
    say(h, `u${String(index + 1)}`, text)
    await h.orchestration.flush('pp')
  }
  for (const text of texts) expect(ofPerson(h, text), text).toHaveLength(1)
})

it('a message held for an engine that is not ready, then released, is still ONE line', async () => {
  const h = open()
  h.orchestration.engineReadinessOf = () => ({ state: 'checking', reason: null })
  say(h, 'w1', 'preciso de um README no projeto')
  await h.orchestration.flush('pp')
  expect(ofPerson(h, 'preciso de um README no projeto')).toHaveLength(1)
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.orchestration.resumeEngineTriggers('pp')
  await h.orchestration.flush('pp')
  expect(ofPerson(h, 'preciso de um README no projeto')).toHaveLength(1)
})

it('a structured question from the worker and the person\'s answer leave ONE line each', async () => {
  const h = open()
  h.orchestration.liveAsk = { question: 'Qual preço usamos?', options: ['R$ 12', 'R$ 15'] }
  say(h, 'q1', '@Nina monte o cardápio novo')
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]!
  expect(h.answerAttention({ ...SCOPE, ticketId: ticket.id, text: 'R$ 15 e sem taxa', optionIds: [] })).toBe(true)
  await h.orchestration.flush('pp')
  expect(ofPerson(h, '@Nina monte o cardápio novo')).toHaveLength(1)
  expect(ofPerson(h, 'R$ 15 e sem taxa')).toHaveLength(1)
})

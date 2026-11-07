import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { ASK_DAILY_BUDGET } from '../src/persona-asks.ts'
import { SCOPE, it, openJourney, say, seedJourney } from './journeys/journey-host.ts'

/**
 * Structured question, phase 3 (contracts/structured-question.md): a LIVE worker that ends its turn with `report.ask` (chips, a
 * sequence) leaves the card on the Ticket instead of a plain "Precisa de você" line; when the card cannot open (budget, repeated,
 * malformed) the plain question is asked, never silence.
 */

const WORK = '@Nina monte o cardápio novo'

function open(): PersonaHost {
  const h = openJourney()
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
  ])
  return h
}

const geral = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const tickets = (h: PersonaHost): Ticket[] => h.orchestration.runtime('pp').repo.tickets.list()

it('a worker that writes options ends its turn with ONE card (chips), no plain line, and the Ticket waits on it', async () => {
  const h = open()
  h.orchestration.liveAsk = { question: 'Qual preço usamos?', options: ['R$ 12', 'R$ 15'] }
  say(h, 'u1', WORK)
  await h.orchestration.flush('pp')
  const ticket = tickets(h)[0]!
  expect(ticket.attention).toMatchObject({ question: 'Qual preço usamos?', ask: { multiple: false, options: [{ id: 'r-12', label: 'R$ 12' }, { id: 'r-15', label: 'R$ 15' }] } })
  const cards = geral(h).filter(row => row.personaAsk !== undefined)
  expect(cards).toHaveLength(1)
  expect(cards[0]).toMatchObject({ actorId: 'nina', personaAsk: { question: 'Qual preço usamos?', ticketId: ticket.id } })
  expect(geral(h).some(row => row.body.startsWith('Precisa de você:'))).toBe(false)
  // the person picks a chip: the work goes on
  expect(h.answerAttention({ ...SCOPE, ticketId: ticket.id, text: '', optionIds: ['r-15'] })).toBe(true)
  expect(tickets(h)[0]!.attention).toBeUndefined()
  expect(h.orchestration.liveAsk).toBeUndefined() // consumed by the turn, never leaks into the next one
})

it('a sequence of questions opens ONE card at a time with "Pergunta n de m"', async () => {
  const h = open()
  h.orchestration.liveAsk = { questions: [
    { question: 'Qual preço?', options: ['R$ 12', 'R$ 15'] },
    { question: 'Quais dias?', multiple: true, options: ['Seg', 'Qua', 'Sex'] },
  ] }
  say(h, 'u1', WORK)
  await h.orchestration.flush('pp')
  const ticket = tickets(h)[0]!
  expect(ticket.attention?.ask?.step).toEqual({ index: 1, total: 2 })
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(1)
})

it('when the card cannot open (malformed chips) the plain question is asked, never silence', async () => {
  const h = open()
  // one chip only: the host refuses it; the first question still reaches the person as a plain line
  h.orchestration.liveAsk = { question: 'Qual preço usamos?', options: ['só uma'] }
  say(h, 'u1', WORK)
  await h.orchestration.flush('pp')
  const ticket = tickets(h)[0]!
  expect(ticket.attention).toMatchObject({ question: 'Qual preço usamos?' })
  expect(ticket.attention?.ask).toBeUndefined()
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(0)
  expect(geral(h).some(row => row.body === 'Precisa de você: Qual preço usamos?')).toBe(true)
})

it('past the daily budget the card does not open and the plain question is asked instead', async () => {
  const h = open()
  for (let i = 0; i < ASK_DAILY_BUDGET; i += 1) {
    h.orchestration.liveAsk = { question: `Pergunta ${String(i + 1)}?`, options: ['A', 'B'] }
    say(h, `u${String(i + 1)}`, `${WORK} ${String(i + 1)}`)
    await h.orchestration.flush('pp')
  }
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(ASK_DAILY_BUDGET)
  h.orchestration.liveAsk = { question: 'Mais uma pergunta?', options: ['A', 'B'] }
  say(h, 'u9', `${WORK} extra`)
  await h.orchestration.flush('pp')
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(ASK_DAILY_BUDGET)
  expect(geral(h).some(row => row.body === 'Precisa de você: Mais uma pergunta?')).toBe(true)
})

it('a question with no structured part behaves exactly as before (plain line, plain Attention)', async () => {
  const h = open()
  h.orchestration.liveQuestion = 'Qual cor usamos?'
  say(h, 'u1', WORK)
  await h.orchestration.flush('pp')
  expect(tickets(h)[0]!.attention).toEqual({ id: expect.any(String), question: 'Qual cor usamos?' })
  expect(geral(h).some(row => row.body === 'Precisa de você: Qual cor usamos?')).toBe(true)
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(0)
})

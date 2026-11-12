import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect } from 'vitest'
import { CONTINUE_CHIP, STOP_CHIP, continueQuestionOf, isContinueStop, offerContinueCard, stoppedLineOf } from '../src/continue-card.ts'
import type PersonaHost from '../src/index.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/**
 * Item 7 (colheita): the one-click "Continuar" card that replaces the technical error when the extra rounds of the end-of-turn
 * controller did not fix a turn. Her words are not posted; the honest sentence is, with two chips. One click = a new round.
 */
const CLOCK = '2026-11-03T15:00:00.000Z'
const FALA = 'Eu ia dizer que estava pronto, mas nada foi feito de verdade: nenhum arquivo foi salvo e nada foi enviado.'

function setup(): { h: PersonaHost } {
  const h = openJourney(CLOCK)
  seedJourney(h, [
    { id: 'guia', name: 'Guia', title: 'Coordenação', coordination: true },
    { id: 'nina', name: 'Nina', title: 'Pesquisa' },
  ])
  h.events.append({ id: 'm-t1', workspaceId: 'ws', projectId: 'pp', streamKind: 'channel', ownerId: 'geral', type: 'message',
    body: 'preciso do cardápio novo', actorId: 'ana', subjectId: 'cardapio', occurredAt: CLOCK })
  const ticket: Ticket = {
    id: 't1', title: 'Cardápio novo', decisionId: 'd1',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [],
    assignments: [{ id: 't1-a1', state: 'running', createdAt: CLOCK, startedAt: CLOCK }],
    inputs: [], undelivered: [],
    createdAt: CLOCK, updatedAt: CLOCK, origin: { triggerId: 'm-t1', triggerIds: ['m-t1'] },
    execution: { name: 'Nina', directory: '.', assignment: 'Cardápio novo' },
  }
  h.orchestration.runtime('pp').repo.tickets.save(ticket)
  return { h }
}

const offer = (h: PersonaHost, ticketId = 't1', fala: string = FALA) =>
  offerContinueCard({ orchestration: h.orchestration, asks: h.personaAsks }, { projectId: 'pp', ticketId, fala })

const geral = (h: PersonaHost) => h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
const ticketOf = (h: PersonaHost): Ticket => h.orchestration.runtime('pp').repo.tickets.get('t1')!
const heard = (h: PersonaHost): Array<{ text: string }> => ticketOf(h).inputs.flatMap(input => (input.kind === 'text' && input.id.startsWith('ans-') ? [{ text: input.text }] : []))

describe('continueQuestionOf', () => {
  it('is the honest sentence plus the one-click question', () => {
    expect(continueQuestionOf(FALA)).toBe(`${FALA} Quer que eu continue?`)
  })
  it('flattens line breaks and survives an empty sentence', () => {
    expect(continueQuestionOf('Parei aqui.\n\nFalta o resto.')).toBe('Parei aqui. Falta o resto. Quer que eu continue?')
    expect(continueQuestionOf('   ')).toBe('Quer que eu continue?')
  })
  it('stays inside the 500 characters of a question, tail included', () => {
    const long = continueQuestionOf('x'.repeat(2000))
    expect(long.length).toBeLessThanOrEqual(500)
    expect(long.endsWith('… Quer que eu continue?')).toBe(true)
  })
})

it('opens ONE card with the honest sentence and two chips; her own words never reach the thread', () => {
  const { h } = setup()
  expect(offer(h)).toMatchObject({ ok: true })
  const attention = ticketOf(h).attention!
  expect(attention.question).toBe(`${FALA} Quer que eu continue?`)
  expect(attention.ask?.options).toEqual([{ id: CONTINUE_CHIP, label: 'Continuar' }, { id: STOP_CHIP, label: 'Parar por aqui' }])
  const cards = geral(h).filter(row => row.personaAsk !== undefined)
  expect(cards).toHaveLength(1)
  expect(cards[0]!.body.split('\n').slice(0, 2)).toEqual([`Nina pergunta: ${FALA} Quer que eu continue?`, 'Opções: Continuar · Parar por aqui'])
  expect(h.listPersonaAsks(SCOPE)).toMatchObject([{ askId: attention.id, status: 'open' }])
  expect(geral(h).some(row => /Pronto/u.test(row.body))).toBe(false)
})

it('one click on "Continuar" is the answer: the worker hears it and the card turns read-only with the choice', () => {
  const { h } = setup()
  offer(h)
  const attention = ticketOf(h).attention!
  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: [CONTINUE_CHIP] })).toBe(true)
  expect(ticketOf(h).attention).toBeUndefined()
  expect(heard(h)).toEqual([{ text: 'Escolhi: Continuar.' }])
  expect(geral(h).find(row => row.id === `answer:t1:${attention.id}`)).toMatchObject({ body: 'Continuar', actorId: 'ana' })
  expect(h.listPersonaAsks(SCOPE)).toMatchObject([{ askId: attention.id, status: 'answered', answer: { optionIds: [CONTINUE_CHIP] } }])
})

it('"Parar por aqui" only ENDS the Task (stopped by the person): one short line, nobody is woken, no turn is spent', async () => {
  const { h } = setup()
  offer(h)
  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: [STOP_CHIP] })).toBe(true)
  await h.orchestration.flush('pp')
  const ticket = ticketOf(h)
  expect(ticket.ended?.outcome).toBe('stopped')
  expect(ticket.assignments).toHaveLength(1) // no new Assignment: the persona was not woken
  const line = geral(h).find(row => row.id.startsWith('stop:t1:'))
  expect(line).toMatchObject({ actorId: 'nina', body: stoppedLineOf('Cardápio novo') })
  expect(stoppedLineOf('Cardápio novo')).toBe('Parado. “Cardápio novo” ficou parada. É só pedir de novo.')
  // the only lines after the card are the person's click and this one: no delivery, no error, no "Pronto"
  expect(geral(h).filter(row => row.actorId === 'nina' && row.personaAsk === undefined).map(row => row.id.split(':')[0])).toEqual(['stop'])
  expect(h.listPersonaAsks(SCOPE)).toMatchObject([{ status: 'answered', answer: { optionIds: [STOP_CHIP] } }])
})

it('"Continuar" still opens the new round (the Task stays open and the persona is woken)', async () => {
  const { h } = setup()
  offer(h)
  h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: [CONTINUE_CHIP] })
  await h.orchestration.flush('pp')
  expect(ticketOf(h).ended).toBeUndefined()
  expect(ticketOf(h).assignments.length).toBeGreaterThanOrEqual(2)
})

describe('isContinueStop', () => {
  const card = { id: 'a', question: 'Quer que eu continue?', ask: { multiple: false, options: [{ id: CONTINUE_CHIP, label: 'Continuar' }, { id: STOP_CHIP, label: 'Parar por aqui' }] } }
  it('is true only for the stop chip of the Continuar card itself', () => {
    expect(isContinueStop(card, [STOP_CHIP])).toBe(true)
    expect(isContinueStop(card, [CONTINUE_CHIP])).toBe(false)
    expect(isContinueStop(card, [])).toBe(false)
    expect(isContinueStop(card, [STOP_CHIP, CONTINUE_CHIP])).toBe(false)
  })
  it('never fires for another question, even one that has a chip called "parar"', () => {
    expect(isContinueStop(undefined, [STOP_CHIP])).toBe(false)
    expect(isContinueStop({ id: 'b', question: 'O que fazer?' }, [STOP_CHIP])).toBe(false)
    expect(isContinueStop({ id: 'c', question: 'O que fazer?', ask: { multiple: false, options: [{ id: STOP_CHIP, label: 'Parar' }, { id: 'seguir', label: 'Seguir' }] } }, [STOP_CHIP])).toBe(false)
  })
})

it('is idempotent: a Ticket with a question already open gets no second card', () => {
  const { h } = setup()
  expect(offer(h)).toMatchObject({ ok: true })
  expect(offer(h)).toEqual({ ok: false, reason: 'already-open' })
  expect(offer(h, 't1', 'Outra frase.')).toEqual({ ok: false, reason: 'already-open' })
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(1)
})

it('a Ticket that ended or does not exist gets no card and no error', () => {
  const { h } = setup()
  expect(offer(h, 'nao-existe')).toEqual({ ok: false, reason: 'ended' })
  const rt = h.orchestration.runtime('pp')
  rt.repo.tickets.save({ ...ticketOf(h), ended: { at: CLOCK, outcome: 'dropped' } } as Ticket)
  expect(offer(h)).toEqual({ ok: false, reason: 'ended' })
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(0)
})

it('does not spend the persona\'s own budget of questions: she can still ask after the card is answered', () => {
  const { h } = setup()
  offer(h)
  h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: [CONTINUE_CHIP] })
  const asked = h.personaAsks.ask({ projectId: 'pp', ticketId: 't1', personaId: 'nina', questions: [{ question: 'Qual preço?', options: [{ label: 'R$ 12' }, { label: 'R$ 15' }] }] })
  expect(asked.ok).toBe(true)
})

it('uses the sentence the controller wrote, whatever it is (the budget-ran-out case)', () => {
  const { h } = setup()
  const fala = 'Tentei três vezes e ainda não terminei: falta montar o arquivo final.'
  expect(offer(h, 't1', fala)).toMatchObject({ ok: true })
  expect(ticketOf(h).attention?.question).toBe(`${fala} Quer que eu continue?`)
})

it('is wired by the host: the end-of-turn controller reaches it through orchestration.continueCard', () => {
  const { h } = setup()
  expect(h.orchestration.continueCard).toBeTypeOf('function')
  h.orchestration.continueCard?.({ projectId: 'pp', ticketId: 't1', personaId: 'nina', motivo: 'limite', fala: FALA })
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(1)
})

it('the controller\'s own sequence: it reports the Task as waiting with the sentence as a PLAIN question, then calls the card, which upgrades it', () => {
  const { h } = setup()
  const rt = h.orchestration.runtime('pp')
  rt.engine.report('t1', { state: 'waiting', summary: FALA, question: FALA }) // what the turn close does before calling the card
  expect(ticketOf(h).attention).toMatchObject({ question: FALA })
  expect(ticketOf(h).attention?.ask).toBeUndefined() // no buttons yet
  h.orchestration.continueCard?.({ projectId: 'pp', ticketId: 't1', personaId: 'nina', motivo: 'sem-prova', fala: FALA })
  const attention = ticketOf(h).attention!
  expect(attention.question).toBe('Quer que eu continue?') // the sentence is already a line in the thread: it is not said twice
  expect(attention.ask?.options).toEqual([{ id: CONTINUE_CHIP, label: 'Continuar' }, { id: STOP_CHIP, label: 'Parar por aqui' }])
  const cards = geral(h).filter(row => row.personaAsk !== undefined)
  expect(cards).toHaveLength(1)
  expect(cards[0]!.body.split('\n').slice(0, 2)).toEqual(['Nina pergunta: Quer que eu continue?', 'Opções: Continuar · Parar por aqui'])
  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: [CONTINUE_CHIP] })).toBe(true)
  expect(heard(h)).toEqual([{ text: 'Escolhi: Continuar.' }])
})

it('a question that is NOT the controller\'s sentence is never replaced by the card', () => {
  const { h } = setup()
  h.orchestration.runtime('pp').engine.report('t1', { state: 'waiting', summary: 'Pergunta', question: 'Qual a cor do cartaz?' })
  h.orchestration.continueCard?.({ projectId: 'pp', ticketId: 't1', personaId: 'nina', motivo: 'sem-prova', fala: FALA })
  expect(ticketOf(h).attention?.question).toBe('Qual a cor do cartaz?')
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(0)
})

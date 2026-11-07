import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { expect } from 'vitest'
import type PersonaHost from '../src/index.ts'
import { ASK_DAILY_BUDGET } from '../src/persona-asks.ts'
import { RemoteFault } from '../src/remote-guard.ts'
import { SCOPE, it, openJourney, seedJourney } from './journeys/journey-host.ts'

/** Structured questions (contracts/structured-question.md): chips, a sequence asked one at a time, the budget, the read-only card. */

const CLOCK = '2026-11-03T15:00:00.000Z'

function setup(): { h: PersonaHost; ticketId: string } {
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
  return { h, ticketId: 't1' }
}

const price = { question: 'Qual preço?', options: [{ label: 'R$ 12' }, { label: 'R$ 15' }] }
const days = { question: 'Quais dias?', multiple: true, options: [{ label: 'Seg' }, { label: 'Qua' }, { label: 'Sex' }] }

function ask(h: PersonaHost, questions: Parameters<PersonaHost['personaAsks']['ask']>[0]['questions'], ticketId = 't1') {
  return h.personaAsks.ask({ projectId: 'pp', ticketId, personaId: 'nina', questions })
}

function geral(h: PersonaHost) {
  return h.listMessages({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events
}

const ticketOf = (h: PersonaHost, id = 't1'): Ticket => h.orchestration.runtime('pp').repo.tickets.get(id)!
/** What the person told the worker (waking the worker adds a note of its own, which is not an answer). */
const heard = (h: PersonaHost): Array<{ text: string }> => ticketOf(h).inputs.flatMap(input => (input.kind === 'text' && input.id.startsWith('ans-') ? [{ text: input.text }] : []))

function fault(run: () => unknown): RemoteFault {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(RemoteFault)
    return error as RemoteFault
  }
  throw new Error('expected a RemoteFault')
}

it('a question with chips opens on the Ticket and leaves ONE card in the thread, with the Muse\'s plain sentence', () => {
  const { h } = setup()
  const asked = ask(h, [price])
  expect(asked.ok).toBe(true)
  const attention = ticketOf(h).attention!
  expect(attention).toMatchObject({ question: 'Qual preço?', ask: { multiple: false, options: [{ id: 'r-12', label: 'R$ 12' }, { id: 'r-15', label: 'R$ 15' }] } })
  const cards = geral(h).filter(row => row.personaAsk !== undefined)
  expect(cards).toHaveLength(1)
  expect(cards[0]).toMatchObject({ actorId: 'nina', personaAsk: { askId: attention.id, ticketId: 't1', personaName: 'Nina', question: 'Qual preço?', multiple: false } })
  expect(cards[0]!.body.split('\n').slice(0, 2)).toEqual(['Nina pergunta: Qual preço?', 'Opções: R$ 12 · R$ 15'])
  expect(cards[0]!.personaAsk?.step).toBeUndefined()
  expect(h.listPersonaAsks(SCOPE)).toMatchObject([{ askId: attention.id, status: 'open', cardId: cards[0]!.id }])
})

it('answering a chip: the person\'s message says the chosen label, the worker reads it, the card becomes read-only with the choice', () => {
  const { h } = setup()
  ask(h, [price])
  const attention = ticketOf(h).attention!
  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['r-15'] })).toBe(true)
  const reply = geral(h).find(row => row.id === `answer:t1:${attention.id}`)
  expect(reply).toMatchObject({ body: 'R$ 15', actorId: 'ana' })
  expect(ticketOf(h).attention).toBeUndefined()
  expect(heard(h)).toEqual([{ text: 'Escolhi: R$ 15.' }])
  expect(h.listPersonaAsks(SCOPE)).toMatchObject([{ askId: attention.id, status: 'answered', answer: { optionIds: ['r-15'], text: '', attachmentIds: [] } }])
  // one answer per question
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['r-12'] })).code).toBe('conflict')
})

it('multiple choice with words AND a file: all three go together; the thread says "chips — words"', () => {
  const { h } = setup()
  ask(h, [days])
  const file = h.attachFile({ ...SCOPE, streamKind: 'channel', ownerId: 'geral', name: 'agenda.txt', bytesBase64: Buffer.from('agenda').toString('base64') })
  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: 'Só se chover', optionIds: ['seg', 'qua'], attachmentIds: [file.id] })).toBe(true)
  const reply = geral(h).find(row => row.id.startsWith('answer:t1:'))
  expect(reply).toMatchObject({ body: 'Seg, Qua — Só se chover', attachmentIds: [file.id] })
  expect(heard(h)).toEqual([{ text: 'Escolhi: Seg, Qua. Só se chover\nAnexos: agenda.txt' }])
  expect(h.listPersonaAsks(SCOPE)[0]).toMatchObject({ status: 'answered', answer: { optionIds: ['seg', 'qua'], text: 'Só se chover', attachmentIds: [file.id] } })
})

it('a sequence of 3: one card at a time (1 de 3, 2 de 3, 3 de 3), the worker hears nothing until the last, then ONE input with every answer', () => {
  const { h } = setup()
  ask(h, [price, days, { question: 'Alguma observação?' }])
  expect(geral(h).filter(row => row.personaAsk !== undefined).map(row => row.personaAsk?.step)).toEqual([{ index: 1, total: 3 }])

  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['r-12'] })).toBe(false) // the sequence advanced
  let cards = geral(h).filter(row => row.personaAsk !== undefined)
  expect(cards.map(row => [row.personaAsk?.question, row.personaAsk?.step])).toEqual([
    ['Qual preço?', { index: 1, total: 3 }], ['Quais dias?', { index: 2, total: 3 }],
  ])
  expect(heard(h)).toEqual([]) // the worker has heard nothing
  expect(ticketOf(h).undelivered).toEqual([])
  expect(h.listPersonaAsks(SCOPE).map(row => row.status)).toEqual(['answered', 'open'])

  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['seg', 'sex'] })).toBe(false)
  cards = geral(h).filter(row => row.personaAsk !== undefined)
  expect(cards.map(row => row.personaAsk?.step?.index)).toEqual([1, 2, 3])
  expect(cards[2]!.personaAsk?.options).toBeUndefined() // the last one is words only
  expect(h.listPersonaAsks(SCOPE).map(row => row.status)).toEqual(['answered', 'answered', 'open'])

  expect(h.answerAttention({ ...SCOPE, ticketId: 't1', text: 'Sem glúten' })).toBe(true)
  expect(ticketOf(h).attention).toBeUndefined()
  expect(heard(h)).toHaveLength(1)
  expect(heard(h)[0]).toMatchObject({ text: 'Respostas:\n1. Qual preço?: R$ 12\n2. Quais dias?: Seg, Sex\n3. Alguma observação?: Sem glúten' })
  expect(h.listPersonaAsks(SCOPE).map(row => row.status)).toEqual(['answered', 'answered', 'answered'])
  expect(h.listPersonaAsks({ ...SCOPE, ticketId: 'outro' })).toEqual([])
})

it('bad answers are refused BEFORE anything is posted: unknown chip, two chips on a single choice, chips on a free-text question, nothing at all', () => {
  const { h } = setup()
  ask(h, [price])
  const before = geral(h).length
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['zzz'] }))).toMatchObject({ code: 'invalid-payload', message: 'Essa opção não existe nesta pergunta.' })
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['r-12', 'r-15'] }))).toMatchObject({ code: 'invalid-payload', message: 'Escolha só uma opção.' })
  expect(fault(() => h.answerAttention({ ...SCOPE, ticketId: 't1', text: '' })).message).toBe('Escreva a resposta, escolha uma opção ou anexe um arquivo.')
  expect(geral(h)).toHaveLength(before)
  expect(ticketOf(h).attention).toBeDefined()

  const free = setup()
  ask(free.h, [{ question: 'Qual pasta?' }])
  expect(fault(() => free.h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['a'] })).message).toBe('Esta pergunta não tem opções para escolher.')
})

it('words in the thread answer a structured question too (no chip needed), and a sequence still advances without waking the worker', () => {
  const { h } = setup()
  ask(h, [price, { question: 'Alguma observação?' }])
  h.postMessage({ ...SCOPE, id: 'say-1', streamKind: 'channel', ownerId: 'geral', actorId: 'ana', body: 'doze reais está bom', subjectId: 'cardapio', occurredAt: CLOCK })
  expect(ticketOf(h).attention).toMatchObject({ question: 'Alguma observação?', ask: { step: { index: 2, total: 2 } } })
  expect(heard(h)).toEqual([])
  expect(h.listPersonaAsks(SCOPE).map(row => row.status)).toEqual(['answered', 'open'])
  expect(geral(h).filter(row => row.personaAsk !== undefined)).toHaveLength(2)
})

it('the budget: one open question per Ticket, no repeats in 24 h, a bad ask opens nothing, 4 interruptions a day, and she is never stuck', () => {
  const { h } = setup()
  const first = ask(h, [price])
  expect(first.ok).toBe(true)
  expect(ask(h, [days])).toMatchObject({ ok: false, message: expect.stringMatching(/pergunta aberta/u) }) // one at a time
  h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['r-12'] })
  expect(ask(h, [price])).toMatchObject({ ok: false, message: 'Você já perguntou isso. Espere a resposta ou siga com a melhor suposição.' })
  expect(ask(h, [{ question: 'Só uma opção?', options: [{ label: 'Única' }] }])).toMatchObject({ ok: false, message: expect.stringMatching(/pelo menos 2 opções/u) })
  expect(ticketOf(h).attention).toBeUndefined() // a refused ask opens nothing
  // 3 more are fine (4 in the day), the 5th is not
  for (const text of ['Pergunta B?', 'Pergunta C?', 'Pergunta D?']) {
    expect(ask(h, [{ question: text }]).ok, text).toBe(true)
    h.answerAttention({ ...SCOPE, ticketId: 't1', text: 'ok' })
  }
  expect(ASK_DAILY_BUDGET).toBe(4)
  const over = ask(h, [{ question: 'Pergunta E?' }])
  expect(over).toMatchObject({ ok: false, message: expect.stringMatching(/perguntas de hoje.*assumption/su) })
  expect(ticketOf(h).attention).toBeUndefined()
  // she goes on, and the thread says so honestly
  expect(h.personaAsks.assume({ projectId: 'pp', ticketId: 't1', personaId: 'nina', assumption: 'Vou usar R$ 12 e confirmo no relatório.' }).ok).toBe(true)
  expect(geral(h).some(row => row.body === 'Nina seguiu sem a sua resposta: Vou usar R$ 12 e confirmo no relatório.' && row.actorId === 'nina')).toBe(true)
  expect(h.personaAsks.assume({ projectId: 'pp', ticketId: 't1', personaId: 'nina', assumption: '  ' }).ok).toBe(false)
})

it('a question whose task ended without an answer is "cancelled"; a plain question gets no card', () => {
  const { h } = setup()
  ask(h, [price])
  h.orchestration.runtime('pp').engine.stopTicket('t1', 'parado')
  expect(h.listPersonaAsks(SCOPE)[0]!.status).toBe('cancelled')
  const plain = setup()
  plain.h.orchestration.runtime('pp').engine.report('t1', { state: 'waiting', summary: 'q', question: 'Qual pasta?' })
  expect(geral(plain.h).some(row => row.personaAsk !== undefined)).toBe(false)
  expect(plain.h.listPersonaAsks(SCOPE)).toEqual([])
})

it('the "Precisa de você" row carries the chips and the step; only someone who can write answers', () => {
  const { h } = setup()
  ask(h, [price, days])
  const row = h.listPersonaAsks(SCOPE)[0]!
  expect(row.options?.map(option => option.id)).toEqual(['r-12', 'r-15'])
  h.createMember({ id: 'gus', workspaceId: 'ws', projectId: 'pp', displayName: 'Gus', handle: 'gus', role: 'guest' })
  h.sessionMemberId = 'gus'
  expect(() => h.answerAttention({ ...SCOPE, ticketId: 't1', text: '', optionIds: ['r-12'] })).toThrow(/forbidden/u)
  h.sessionMemberId = 'ana'
  expect(ticketOf(h).attention).toBeDefined()
})

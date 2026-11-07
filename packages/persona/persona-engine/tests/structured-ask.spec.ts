import { expect, it } from 'vitest'
import {
  ASK_MAX_OPTIONS,
  AskError,
  Engine,
  MemoryRepositories,
  applyAskAnswer,
  askInputOf,
  describeAskAnswers,
  initialAsk,
  normalizeAskQuestions,
  optionIdOf,
  type Assessor,
  type Candidate,
  type EngineOptions,
  type Executor,
  type Policy,
  type Ticket,
  type Trigger,
} from '../src/index.ts'

/** Structured questions (contracts/structured-question.md): chips, single/multiple choice, a sequence asked one at a time. */

const AT = '2026-11-04T12:00:00.000Z'

function failure(run: () => unknown): AskError {
  try {
    run()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AskError)
    return error as AskError
  }
  throw new Error('expected an AskError')
}

it('chips get stable ids from their labels; a written id is kept; bad or repeated ones are refused with a Portuguese line', () => {
  expect(optionIdOf('Não, obrigado!', new Set())).toBe('nao-obrigado')
  expect(optionIdOf('Sim', new Set(['sim']))).toBe('sim-2')
  expect(optionIdOf('???', new Set())).toBe('opcao')
  const [q] = normalizeAskQuestions([{ question: '  Qual   preço? ', options: [{ label: 'R$ 12' }, { id: 'caro', label: 'R$ 15' }] }])
  expect(q).toEqual({ question: 'Qual preço?', options: [{ id: 'r-12', label: 'R$ 12' }, { id: 'caro', label: 'R$ 15' }] })

  expect(failure(() => normalizeAskQuestions([])).code).toBe('no_questions')
  expect(failure(() => normalizeAskQuestions(Array.from({ length: 6 }, () => ({ question: 'x?' })))).code).toBe('too_many_questions')
  expect(failure(() => normalizeAskQuestions([{ question: '  ' }])).code).toBe('empty_question')
  expect(failure(() => normalizeAskQuestions([{ question: 'x'.repeat(501) }])).code).toBe('question_too_long')
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', options: [{ label: 'Só uma' }] }])).code).toBe('too_few_options')
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', options: Array.from({ length: ASK_MAX_OPTIONS + 1 }, (_, i) => ({ label: `o${String(i)}` })) }])).code).toBe('too_many_options')
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', options: [{ label: 'A' }, { label: ' ' }] }])).code).toBe('empty_label')
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', options: [{ label: 'A' }, { label: 'a' }] }])).code).toBe('duplicate_option')
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', options: [{ label: 'A'.repeat(61) }, { label: 'B' }] }])).code).toBe('label_too_long')
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', options: [{ id: 'Maiúscula!', label: 'A' }, { label: 'B' }] }])).code).toBe('bad_option_id')
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', multiple: true }])).code).toBe('too_few_options') // multiple needs chips
  expect(failure(() => normalizeAskQuestions([{ question: 'Qual?', options: [{ label: 'A' }, { label: 'B' }] }, { question: ' ' }])).message).toMatch(/^Pergunta 2:/u)
})

function ticketAsking(questions: Parameters<typeof normalizeAskQuestions>[0]): Ticket {
  const first = initialAsk(normalizeAskQuestions(questions))
  return {
    id: 't1', title: 'Cardápio', decisionId: 'd', channels: [], assignments: [], inputs: [], undelivered: [],
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'chat', id: 'ana' }, scope: 'small' },
    createdAt: AT, updatedAt: AT, origin: { triggerId: 'm1', triggerIds: ['m1'] },
    attention: { id: 'att-1', question: first.question, ask: first.ask },
  }
}

it('a single question with chips: one chip, or words, or both; the worker reads the chosen LABELS', () => {
  const asking = ticketAsking([{ question: 'Qual preço?', options: [{ label: 'R$ 12' }, { label: 'R$ 15' }] }])
  expect(asking.attention?.ask).toEqual({ options: [{ id: 'r-12', label: 'R$ 12' }, { id: 'r-15', label: 'R$ 15' }], multiple: false })
  const chip = applyAskAnswer(asking, { optionIds: ['r-15'] }, AT)
  expect(chip.done).toBe(true)
  expect(chip.ticket.attention).toBeUndefined()
  expect(chip.ticket.inputs.at(-1)).toMatchObject({ kind: 'text', text: 'Escolhi: R$ 15.' })
  expect(chip.ticket.undelivered).toHaveLength(1)
  expect(applyAskAnswer(asking, { optionIds: ['r-12'], text: 'Mas só no almoço' }, AT).ticket.inputs.at(-1)).toMatchObject({ text: 'Escolhi: R$ 12. Mas só no almoço' })
  // free text always works, with or without chips on the question
  expect(applyAskAnswer(asking, { text: 'Depende do dia' }, AT).ticket.inputs.at(-1)).toMatchObject({ text: 'Depende do dia' })
  const plain = ticketAsking([{ question: 'Qual pasta?' }])
  expect(applyAskAnswer(plain, { text: 'src' }, AT).ticket.inputs.at(-1)).toMatchObject({ text: 'src' })
})

it('answers are checked against the OPEN question: unknown chip, two chips on a single choice, a chip where there are none, nothing at all', () => {
  const single = ticketAsking([{ question: 'Qual?', options: [{ label: 'A' }, { label: 'B' }] }])
  expect(failure(() => applyAskAnswer(single, { optionIds: ['z'] }, AT)).message).toBe('Essa opção não existe nesta pergunta.')
  expect(failure(() => applyAskAnswer(single, { optionIds: ['a', 'b'] }, AT)).message).toBe('Escolha só uma opção.')
  expect(failure(() => applyAskAnswer(single, {}, AT)).message).toBe('Escreva a resposta, escolha uma opção ou anexe um arquivo.')
  expect(failure(() => applyAskAnswer(single, { text: '   ' }, AT)).code).toBe('empty_answer')
  expect(failure(() => applyAskAnswer(ticketAsking([{ question: 'Livre?' }]), { optionIds: ['a'] }, AT)).code).toBe('no_options')
  const answered = applyAskAnswer(single, { optionIds: ['a'] }, AT).ticket
  expect(failure(() => applyAskAnswer(answered, { optionIds: ['a'] }, AT)).message).toBe('Essa pergunta já foi respondida.')
  // nothing was written by the refusals
  expect(single.attention).toBeDefined()
  expect(single.inputs).toEqual([])
})

it('multiple choice takes 1..N chips (duplicates folded) and lists them in the question\'s order of choice', () => {
  const multi = ticketAsking([{ question: 'Quais dias?', multiple: true, options: [{ label: 'Seg' }, { label: 'Qua' }, { label: 'Sex' }] }])
  expect(multi.attention?.ask?.multiple).toBe(true)
  const done = applyAskAnswer(multi, { optionIds: ['sex', 'seg', 'sex'] }, AT)
  expect(done.ticket.inputs.at(-1)).toMatchObject({ text: 'Escolhi: Sex, Seg.' })
})

it('a sequence opens ONE question at a time ("2 de 3"), the worker waits until the last, and then reads every answer once', () => {
  let ticket = ticketAsking([
    { question: 'Qual preço?', options: [{ label: 'R$ 12' }, { label: 'R$ 15' }] },
    { question: 'Quais dias?', multiple: true, options: [{ label: 'Seg' }, { label: 'Qua' }] },
    { question: 'Alguma observação?' },
  ])
  expect(ticket.attention?.ask?.step).toEqual({ index: 1, total: 3 })

  const first = applyAskAnswer(ticket, { optionIds: ['r-12'] }, AT)
  expect(first.done).toBe(false)
  ticket = first.ticket
  expect(ticket.attention).toMatchObject({ question: 'Quais dias?', ask: { multiple: true, step: { index: 2, total: 3 } } })
  expect(ticket.attention?.id).not.toBe('att-1')
  expect(ticket.inputs).toEqual([]) // the worker has heard nothing yet
  expect(ticket.undelivered).toEqual([])

  const second = applyAskAnswer(ticket, { optionIds: ['seg', 'qua'] }, AT)
  expect(second.done).toBe(false)
  ticket = second.ticket
  expect(ticket.attention).toMatchObject({ question: 'Alguma observação?', ask: { step: { index: 3, total: 3 } } })
  expect(ticket.attention?.ask?.later).toBeUndefined()

  const last = applyAskAnswer(ticket, { text: 'Sem glúten' }, AT)
  expect(last.done).toBe(true)
  expect(last.ticket.attention).toBeUndefined()
  expect(last.ticket.inputs).toHaveLength(1)
  expect(last.ticket.inputs[0]).toMatchObject({
    kind: 'text',
    text: 'Respostas:\n1. Qual preço?: R$ 12\n2. Quais dias?: Seg, Qua\n3. Alguma observação?: Sem glúten',
  })
  expect(last.ticket.undelivered).toHaveLength(1)
})

it('describeAskAnswers: chips and words together read "chip — words"; a lone free answer is exactly the words', () => {
  expect(describeAskAnswers([{ question: 'Livre?', optionIds: [], text: 'src' }])).toBe('src')
  expect(describeAskAnswers([
    { question: 'A?', options: [{ id: 'a', label: 'Sim' }], optionIds: ['a'], text: 'mas devagar' },
    { question: 'B?', optionIds: [], text: 'tanto faz' },
  ])).toBe('Respostas:\n1. A?: Sim — mas devagar\n2. B?: tanto faz')
})

// ---- through the real Engine (report → attention → answer) ----------------------------------------------------------

function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: { source: 'chat', id: 'ana' },
    human: true, at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

function harness() {
  const repo = new MemoryRepositories()
  const requests: Candidate[] = []
  const launches: Array<{ ticketId: string; assignmentId: string }> = []
  const assessor: Assessor = { request: (c) => { requests.push(c) }, release: () => {} }
  const executor: Executor = { start: (ticket, assignment) => { launches.push({ ticketId: ticket.id, assignmentId: assignment.id }) }, deliver: () => {}, stop: () => {} }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
    revalidate: () => true, admitsInferred: () => true,
  }
  const outbox: EngineOptions['outbox'] = { send: () => {}, status: () => undefined, withdraw: () => {} }
  const engine = new Engine({
    repo, assessor, executor, outbox, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) }, now: () => AT,
  })
  engine.receive(trigger('1'))
  engine.evaluateDue()
  const decision = engine.decide(requests[0]!.triggers[0]!.id, { kind: 'accept', title: 'Cardápio', scope: 'small', reason: 'requested' })
  const launched = launches.shift()
  if (launched) engine.assignmentStarted(launched.ticketId, launched.assignmentId)
  return { repo, engine, ticketId: decision.ticketId! }
}

it('through the Engine: a worker report with a sequence opens question 1 of 3; answering walks it; the last answer is the worker\'s one input', () => {
  const { repo, engine, ticketId } = harness()
  engine.report(ticketId, {
    state: 'waiting', summary: 'Preciso de 3 respostas',
    ask: normalizeAskQuestions([
      { question: 'Qual preço?', options: [{ label: 'R$ 12' }, { label: 'R$ 15' }] },
      { question: 'Quais dias?', multiple: true, options: [{ label: 'Seg' }, { label: 'Qua' }] },
      { question: 'Observação?' },
    ]),
  })
  expect(repo.tickets.get(ticketId)?.attention).toMatchObject({ question: 'Qual preço?', ask: { step: { index: 1, total: 3 } } })

  const one = engine.answerAsk(ticketId, { optionIds: ['r-15'] })
  expect(one.done).toBe(false)
  expect(repo.tickets.get(ticketId)?.attention?.question).toBe('Quais dias?')
  // a plain words answer ("answerAttention") also walks a structured sequence
  engine.answerAttention(ticketId, 'Só segunda')
  expect(repo.tickets.get(ticketId)?.attention).toMatchObject({ question: 'Observação?', ask: { step: { index: 3, total: 3 } } })
  const last = engine.answerAsk(ticketId, { text: 'Sem glúten' })
  expect(last.done).toBe(true)
  const stored = repo.tickets.get(ticketId)!
  expect(stored.attention).toBeUndefined()
  expect(stored.inputs.filter(input => input.kind === 'text').at(-1)).toMatchObject({
    text: 'Respostas:\n1. Qual preço?: R$ 15\n2. Quais dias?: Só segunda\n3. Observação?: Sem glúten',
  })
  expect(() => engine.answerAsk(ticketId, { text: 'de novo' })).toThrow(AskError) // one answer per question
})

it('through the Engine: the plain question and a structured one coexist; a repeated structured ask keeps the sequence in progress', () => {
  const { repo, engine, ticketId } = harness()
  engine.report(ticketId, { state: 'waiting', summary: 'q', question: 'Qual pasta?' })
  expect(repo.tickets.get(ticketId)?.attention).toEqual({ id: expect.any(String), question: 'Qual pasta?' })
  engine.answerAttention(ticketId, 'src')
  engine.report(ticketId, { state: 'waiting', summary: 'q2', ask: normalizeAskQuestions([{ question: 'A?', options: [{ label: 'Sim' }, { label: 'Não' }] }, { question: 'B?' }]) })
  engine.answerAsk(ticketId, { optionIds: ['sim'] })
  const midway = repo.tickets.get(ticketId)!.attention
  expect(midway?.question).toBe('B?')
  // the worker repeats its first question (e.g. after a restart): the sequence in progress is not reset to question 1
  engine.report(ticketId, { state: 'waiting', summary: 'q3', question: 'B?' })
  expect(repo.tickets.get(ticketId)!.attention).toEqual(midway)
})

it('askInputOf reads the shapes models actually write for persona_ask and hands back inputs to normalize', () => {
  // one question with bare-string chips
  expect(askInputOf({ question: 'Qual canal?', options: ['Email', 'WhatsApp'] }))
    .toEqual([{ question: 'Qual canal?', options: [{ label: 'Email' }, { label: 'WhatsApp' }] }])
  // { questions: [...] } with objects, ids, multiple and a bare-string question
  expect(askInputOf({ questions: ['Algo mais?', { question: 'Quais dias?', multiple: true, options: [{ label: 'Seg', id: 'seg' }, { label: 'Ter' }] }] }))
    .toEqual([{ question: 'Algo mais?' }, { question: 'Quais dias?', multiple: true, options: [{ label: 'Seg', id: 'seg' }, { label: 'Ter' }] }])
  // a plain list, and a question with null options is free text
  expect(askInputOf([{ question: 'Qual pasta?', options: null }])).toEqual([{ question: 'Qual pasta?' }])
  // what comes out is exactly what normalizeAskQuestions accepts (ids made from the labels)
  const normalized = normalizeAskQuestions(askInputOf({ question: 'Qual canal?', options: ['E-mail', 'WhatsApp'] }))
  expect(normalized[0]?.options?.map(option => option.id)).toEqual(['e-mail', 'whatsapp'])
})

it('askInputOf refuses what is not a question, in Portuguese, without throwing anything else', () => {
  for (const bad of [undefined, null, 7, 'texto solto', {}, [], { questions: [] }, { question: 3 }]) {
    expect(() => askInputOf(bad), String(JSON.stringify(bad))).toThrow(AskError)
  }
  expect(() => askInputOf({ question: 'Qual?', options: 'a, b' })).toThrow(/lista/u)
  expect(() => askInputOf({ question: 'Qual?', options: ['a', 3] })).toThrow(/texto/u)
  expect(() => askInputOf([{ foo: 'bar' }])).toThrow(/escreva a pergunta/u)
  // counts and lengths stay the job of normalizeAskQuestions
  expect(() => normalizeAskQuestions(askInputOf({ question: 'Qual?', options: ['só uma'] }))).toThrow(AskError)
})

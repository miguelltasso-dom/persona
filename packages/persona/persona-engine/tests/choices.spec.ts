import { expect, it } from 'vitest'
import {
  ASK_QUESTION_MAX,
  AskError,
  CHOICE_LABEL_MAX,
  CHOICE_MAX_OPTIONS,
  CHOICE_QUESTION_MAX,
  choiceAnswerText,
  normalizeAskQuestions,
  readChoiceMarker,
} from '../src/index.ts'

/** The end-of-turn choice card (colheita item 11): 2..6 options A..F, question up to 300 characters, the tap becomes a short message. */

it('one marker at the end of a message is a card with the letters A..F and the words stay', () => {
  const read = readChoiceMarker('Fiz as duas versões do post.\n[[escolha: Qual delas publicamos? | Post para o Instagram | Post para o Facebook | Nenhuma, refaça]]')
  expect(read.text).toBe('Fiz as duas versões do post.')
  expect(read.refused).toBeUndefined()
  expect(read.card?.question).toBe('Qual delas publicamos?')
  expect(read.card?.options.map(option => `${option.id}:${option.letter}:${option.label}`)).toEqual([
    'a:A:Post para o Instagram', 'b:B:Post para o Facebook', 'c:C:Nenhuma, refaça',
  ])
})

it('a message without the marker comes back untouched, and a card with no words around it has empty text', () => {
  expect(readChoiceMarker('Tudo certo por aqui.')).toEqual({ text: 'Tudo certo por aqui.' })
  const bare = readChoiceMarker('[[escolha: Sim ou não? | Sim | Não]]')
  expect(bare.text).toBe('')
  expect(bare.card?.options).toHaveLength(2)
})

it('the question is cut at 300 characters by refusing, and the person still reads the question and the options as plain words', () => {
  const long = 'x'.repeat(CHOICE_QUESTION_MAX + 1)
  const read = readChoiceMarker(`Oi.\n[[escolha: ${long} | Sim | Não]]`)
  expect(read.card).toBeUndefined()
  expect(read.refused).toBe('question_too_long')
  expect(read.text).toContain('A) Sim')
  expect(read.text).toContain('B) Não')
  expect(readChoiceMarker(`[[escolha: ${'x'.repeat(CHOICE_QUESTION_MAX)} | Sim | Não]]`).card).toBeDefined()
})

it('2 to 6 options, each up to 90 characters and none repeated; anything else is refused with a reason', () => {
  expect(readChoiceMarker('[[escolha: Qual? | Só uma]]').refused).toBe('too_few_options')
  expect(readChoiceMarker('[[escolha: Qual? | a | b | c | d | e | f | g]]').refused).toBe('too_many_options')
  const six = readChoiceMarker('[[escolha: Qual? | a | b | c | d | e | f]]')
  expect(six.card?.options.map(option => option.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  expect(CHOICE_MAX_OPTIONS).toBe(6)
  expect(readChoiceMarker(`[[escolha: Qual? | ${'y'.repeat(CHOICE_LABEL_MAX + 1)} | b]]`).refused).toBe('label_too_long')
  expect(readChoiceMarker(`[[escolha: Qual? | ${'y'.repeat(CHOICE_LABEL_MAX)} | b]]`).card).toBeDefined()
  expect(readChoiceMarker('[[escolha: Qual? | Sim | sim]]').refused).toBe('duplicate_option')
  expect(readChoiceMarker('[[escolha: ]]').refused).toBe('empty')
})

it('a marker still arriving (a streaming reply) is hidden, never shown half written', () => {
  expect(readChoiceMarker('Fiz o post.\n[[escolha: Qual delas | Post para').text).toBe('Fiz o post.')
  expect(readChoiceMarker('Fiz o post.\n[[esco').text).toBe('Fiz o post.\n[[esco')
})

it('the last valid marker is the card and every marker leaves the words', () => {
  const read = readChoiceMarker('Antes. [[escolha: Primeira? | a | b]] Meio. [[escolha: Segunda? | c | d]] Depois.')
  expect(read.card?.question).toBe('Segunda?')
  expect(read.text).not.toContain('[[')
  expect(read.text).toContain('Antes.')
  expect(read.text).toContain('Depois.')
})

it('the tap becomes a short message with the letter and the words, and an option that is not the card\'s gives nothing', () => {
  const card = readChoiceMarker('[[escolha: Qual? | Post para o Instagram | Post para o Facebook]]').card
  if (card === undefined) throw new Error('expected a card')
  expect(choiceAnswerText(card, 'b')).toBe('✓ B · Post para o Facebook')
  expect(choiceAnswerText(card, 'z')).toBeUndefined()
})

it('the structured question of persona_ask has the same 300 character ceiling, with the way forward in Portuguese', () => {
  expect(ASK_QUESTION_MAX).toBe(300)
  try {
    normalizeAskQuestions([{ question: 'q'.repeat(301) }])
    throw new Error('expected an AskError')
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(AskError)
    expect((error as AskError).code).toBe('question_too_long')
    expect((error as AskError).message).toContain('300 caracteres')
    expect((error as AskError).message).toContain('só a pergunta curta')
  }
  expect(normalizeAskQuestions([{ question: 'q'.repeat(300) }])).toHaveLength(1)
})

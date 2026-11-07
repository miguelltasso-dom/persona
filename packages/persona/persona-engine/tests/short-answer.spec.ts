/**
 * W3 for SHORT ANSWERS ONLY: the gate that decides whether a task's final report may be the lean one ("Resultado:" / "Bloqueio:", ≤ 100 words). It must be
 * conservative: every deliverable, every handoff or review, the first delivery and anything long keeps the full report. A short task wrongly kept full costs
 * a few hundred tokens; a deliverable wrongly cut to 100 words is a failed delivery.
 */
import { describe, expect, it } from 'vitest'
import { firstDeliveryTask } from '../src/first-delivery.ts'
import { reviewRequestFor } from '../src/review-step.ts'
import { classifyShortAnswer, isShortAnswerTask, SHORT_ANSWER_MAX_CHARS } from '../src/short-answer.ts'

const SHORT: readonly string[] = [
  'Quanto dá 12 pães a R$ 1,50 e 4 bolos a R$ 18?',
  'Qual o horário do standup?',
  'Calcule o total da encomenda: 12 pães e 4 bolos.',
  'Confira se temos farinha para sábado.',
  'Quantas encomendas temos para amanhã?',
  'Verifique se o preço do pão de queijo no Cofre ainda é R$ 8.',
  'Existe algum pedido atrasado?',
  'Qual é o CNPJ da empresa?',
  'Quem está livre para pegar uma tarefa nova?',
  'Há vaga na agenda de sexta?',
  'Converta 3,5 kg de farinha em gramas.',
  'Diga quantos clientes novos entraram na semana.',
]

const FULL: readonly [string, string][] = [
  // deliverables
  ['Monte o cardápio da semana com preços', 'deliverable'],
  ['Pesquise 3 concorrentes e compare preços.', 'deliverable'],
  ['Revise o último código e aponte riscos.', 'deliverable'],
  ['Implemente o filtro de pedidos.', 'deliverable'],
  ['Escreva o post de sábado para o Instagram.', 'deliverable'],
  ['Faça um relatório do dia.', 'deliverable'],
  ['Qual o melhor horário para o post?', 'deliverable'],
  ['Quanto custa montar o cardápio de natal?', 'deliverable'],
  ['Explique como funciona a entrega local.', 'deliverable'],
  ['Qual a receita do pão de queijo?', 'deliverable'],
  ['Me dê uma lista de fornecedores.', 'deliverable'],
  ['Resuma o que decidimos ontem.', 'deliverable'],
  ['Traduza o cardápio para o inglês.', 'deliverable'],
  // not a question or a lookup
  ['Ontem choveu muito na loja.', 'not a question'],
  ['Preciso de ajuda com a padaria.', 'not a question'],
  // shape
  ['Qual o horário do standup?\nE o do almoço?', 'lines'],
  ['Qual o horário do standup. E o do almoço. E o da reunião?', 'sentences'],
  [`Qual é o total ${'dos pedidos de sábado, '.repeat(12)}?`, 'long'],
  ['', 'empty'],
  ['   ', 'empty'],
]

describe('classifyShortAnswer: a question, a lookup, a check, a small calculation', () => {
  it.each(SHORT)('is short: %s', (text) => {
    expect(classifyShortAnswer(text).short).toBe(true)
  })
  it('the limit is exact', () => {
    expect(SHORT_ANSWER_MAX_CHARS).toBe(240)
    const base = 'Qual o total de pedidos de hoje?'
    const filler = (n: number): string => ` ${'x'.repeat(Math.max(0, n - base.length - 2))}`
    expect(isShortAnswerTask(`${base}${filler(240)}`)).toBe(true)
    expect(isShortAnswerTask(`${base}${filler(242)}`)).toBe(false)
  })
})

describe('classifyShortAnswer: everything else keeps the full report', () => {
  it.each(FULL)('keeps the full report: %s (%s)', (text) => {
    expect(isShortAnswerTask(text)).toBe(false)
  })

  it('a message with an image is never short (an image asks for a look, not a one-liner)', () => {
    expect(isShortAnswerTask('Qual a cor do cartaz?')).toBe(true)
    expect(isShortAnswerTask('Qual a cor do cartaz?', { images: 1 })).toBe(false)
  })

  it('the first delivery, a handoff note and a review request are NEVER short, whatever their words', () => {
    const first = firstDeliveryTask({ companyBrief: 'Padaria Estrela: pães artesanais.', executorName: 'Nina' }).assignment
    expect(classifyShortAnswer(first)).toMatchObject({ short: false })
    const review = reviewRequestFor({ authorName: 'Bia', reviewerName: 'Lia', title: 'Cartaz', pass: 1, note: { done: ['arte pronta'], needed: [], files: ['cartaz.png'], decisions: [] } })
    expect(classifyShortAnswer(review).short).toBe(false)
    expect(classifyShortAnswer('Qual a cor? <bilhete>\nFalta:\n- tudo\n</bilhete>').short).toBe(false)
    expect(classifyShortAnswer('Você é Nina. Você executa a Tarefa autorizada. Qual o total?').short).toBe(false)
  })

  it('gives a reason for every refusal', () => {
    for (const [text] of FULL) expect(classifyShortAnswer(text).why).not.toBe('')
  })
})

describe('the gate is closed more often than open on what a host really sends', () => {
  it('none of the lines the host tests use as work (D-073 lanes) is short, except real questions about a number', () => {
    const work = ['Monte o cardápio da semana com preços', 'Pesquise 3 concorrentes e compare preços.', 'Revise o último código e aponte riscos.', 'valeu! agora monta o resumo da semana', 'Faça o relatório do dia', 'Implemente o filtro de pedidos.']
    expect(work.filter(text => isShortAnswerTask(text))).toEqual([])
  })
})

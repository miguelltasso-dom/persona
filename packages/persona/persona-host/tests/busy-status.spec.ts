import { describe, expect, it } from 'vitest'
import { elapsedWords, isStatusAsk, statusLine, stepWords } from '../src/busy-status.ts'

/**
 * Item 7 (colheita): the host answers "como tá indo?" itself, with the real time and the real step, and no model turn.
 * Pure rules: what counts as a status question, how the time and the step are worded, and the sentence.
 */
describe('isStatusAsk', () => {
  it.each([
    'como tá indo?',
    'Como está indo?',
    'e aí, como tá indo?',
    'tá fazendo o quê??',
    'O que você está fazendo?',
    'já terminou?',
    'Já acabou?',
    'status',
    'qual o status?',
    'alguma novidade?',
    'quanto falta?',
    'falta muito?',
    'ainda tá aí?',
    'em que pé tá?',
    '@Bia como tá indo?',
    'Bia, como tá indo?',
    'bom dia, como tá indo hein?',
  ])('"%s" is only a status question', (body) => {
    expect(isStatusAsk(body, ['Bia'])).toBe(true)
  })

  it.each([
    'já terminou? troca a cor para azul',
    'como tá indo? manda o relatório por e-mail',
    'faz o relatório do dia',
    'use a cor azul',
    'como faço para trocar a senha?',
    'quanto custa o plano?',
    'obrigado!',
    '',
    '   ',
    'como tá indo o relatório de vendas de ontem com os números do mês passado e o comparativo do ano todo?',
  ])('"%s" is NOT a status question (a request or something else: the persona reads it)', (body) => {
    expect(isStatusAsk(body, ['Bia'])).toBe(false)
  })
})

describe('elapsedWords', () => {
  it('says the time in plain words', () => {
    expect(elapsedWords(0)).toBe('menos de 1 minuto')
    expect(elapsedWords(59_000)).toBe('menos de 1 minuto')
    expect(elapsedWords(60_000)).toBe('1 minuto')
    expect(elapsedWords(4 * 60_000 + 20_000)).toBe('4 minutos')
    expect(elapsedWords(60 * 60_000)).toBe('1 hora')
    expect(elapsedWords(65 * 60_000)).toBe('1 hora e 5 min')
    expect(elapsedWords(150 * 60_000)).toBe('2 horas e 30 min')
  })
  it('never prints NaN or a negative time', () => {
    expect(elapsedWords(Number.NaN)).toBe('menos de 1 minuto')
    expect(elapsedWords(-5_000)).toBe('menos de 1 minuto')
  })
})

describe('stepWords', () => {
  it.each([
    ['Read', 'lendo os arquivos'],
    ['Glob', 'lendo os arquivos'],
    ['Grep', 'lendo os arquivos'],
    ['mcp__files__read_file', 'lendo os arquivos'],
    ['Write', 'escrevendo um arquivo'],
    ['Edit', 'escrevendo um arquivo'],
    ['apply_patch', 'escrevendo um arquivo'],
    ['Bash', 'rodando um passo no computador'],
    ['functions.shell', 'rodando um passo no computador'],
    ['exec_command', 'rodando um passo no computador'],
    ['WebSearch', 'pesquisando na internet'],
    ['WebFetch', 'pesquisando na internet'],
    ['Task', 'pedindo ajuda a um colega'],
    ['TodoWrite', 'organizando os passos'],
    ['mcp__persona__recall', 'consultando a memória da empresa'],
  ])('%s -> %s', (tool, words) => {
    expect(stepWords(tool)).toBe(words)
  })
  it('does not name a step it cannot say honestly', () => {
    expect(stepWords(undefined)).toBeUndefined()
    expect(stepWords('')).toBeUndefined()
    expect(stepWords('mcp__acme__reconcile_ledger')).toBeUndefined()
  })
  it('never leaks a tool name, a path or an id into the words', () => {
    for (const tool of ['Read', 'Bash', 'WebFetch', 'mcp__persona__recall', 'apply_patch']) {
      const words = stepWords(tool)!
      expect(words).not.toMatch(/[_./\\]|mcp|bash|read|write|fetch|patch|persona/iu)
    }
  })
})

describe('statusLine', () => {
  it('is the whole answer to a status question, with the time and the step', () => {
    expect(statusLine({ name: 'Bento', mine: true, title: 'Relatório do dia', elapsedMs: 30 * 60_000, step: 'lendo os arquivos', answersNow: true }))
      .toBe('Estou em “Relatório do dia” há 30 minutos, agora lendo os arquivos. Te aviso quando terminar.')
  })
  it('keeps the short sentence the product always had for a message the persona will answer later with a model turn', () => {
    // Existing specs and the e2e pin this exact sentence: it must not change with the time or the step.
    expect(statusLine({ name: 'Bento', mine: true, title: 'Relatório do dia', elapsedMs: 4 * 60_000, step: 'escrevendo um arquivo', answersNow: false }))
      .toBe('Estou terminando “Relatório do dia”; respondo em seguida.')
    expect(statusLine({ name: 'Bia', mine: false, who: 'Bento', answersNow: false })).toBe('A equipe está terminando uma tarefa; respondo em seguida.')
    expect(statusLine({ name: 'Bento', mine: true, answersNow: false })).toBe('Estou terminando uma tarefa; respondo em seguida.')
  })
  it('speaks for a colleague when the running task is not hers, without a pronoun', () => {
    expect(statusLine({ name: 'Bia', mine: false, who: 'Bento', title: 'Relatório do dia', elapsedMs: 2 * 60_000, answersNow: true }))
      .toBe('Bento está em “Relatório do dia” há 2 minutos. O resultado aparece aqui quando terminar.')
    expect(statusLine({ name: 'Bia', mine: false, title: 'Relatório do dia', elapsedMs: 2 * 60_000, answersNow: true }))
      .toBe('A equipe está em “Relatório do dia” há 2 minutos. O resultado aparece aqui quando terminar.')
  })
  it('keeps the title private for a reader who may not know it', () => {
    expect(statusLine({ name: 'Bia', mine: true, elapsedMs: 90_000, step: 'rodando um passo no computador', answersNow: true }))
      .toBe('Estou numa tarefa há 1 minuto, agora rodando um passo no computador. Te aviso quando terminar.')
  })
  it('says only what is known: a step without a time, a time without a step', () => {
    expect(statusLine({ name: 'Bento', mine: true, title: 'X', step: 'lendo os arquivos', answersNow: true }))
      .toBe('Estou em “X”, agora lendo os arquivos. Te aviso quando terminar.')
    expect(statusLine({ name: 'Bento', mine: true, title: 'X', elapsedMs: 5 * 60_000, answersNow: true }))
      .toBe('Estou em “X” há 5 minutos. Te aviso quando terminar.')
  })
  it('says "esperando uma resposta" and claims no time and no step when the task waits', () => {
    expect(statusLine({ name: 'Bento', mine: true, title: 'X', elapsedMs: 40 * 60_000, step: 'lendo os arquivos', waiting: true, answersNow: true }))
      .toBe('Estou esperando uma resposta em “X”. Te aviso quando terminar.')
    expect(statusLine({ name: 'Bia', mine: false, who: 'Bento', waiting: true, answersNow: true }))
      .toBe('Bento está esperando uma resposta numa tarefa. O resultado aparece aqui quando terminar.')
  })
  it('falls back to a short sentence when neither time nor step is known', () => {
    expect(statusLine({ name: 'Bento', mine: true, title: 'Relatório do dia', answersNow: true })).toBe('Estou terminando “Relatório do dia”. Te aviso quando terminar.')
  })
  it('never prints NaN or a negative time as if it were a fact', () => {
    expect(statusLine({ name: 'Bento', mine: true, title: 'X', elapsedMs: Number.NaN, answersNow: true })).toBe('Estou terminando “X”. Te aviso quando terminar.')
    expect(statusLine({ name: 'Bento', mine: true, title: 'X', elapsedMs: -1, answersNow: true })).toBe('Estou terminando “X”. Te aviso quando terminar.')
  })
})

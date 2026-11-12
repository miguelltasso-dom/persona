// COLHEITA §6 (Quill): modelo puro da linha do passo. Sem DOM.
import { describe, expect, it } from 'vitest'
import { WORK_STEP_DELAY_MS, WORK_STEP_MAX_CHARS, WORK_STEP_MIN_SWAP_MS, capStepText, decideSwap, plainStepSentence, workStepText } from '../src/client/chat/work-step/work-step-model.ts'

const LABELS = { line: (name: string, text: string) => `${name} · ${text}`, working: 'Trabalhando' }

describe('COLHEITA §6 · constantes da spec', () => {
  it('5 s para aparecer, no máximo 1 troca a cada 2 s, 56 caracteres', () => {
    expect(WORK_STEP_DELAY_MS).toBe(5000)
    expect(WORK_STEP_MIN_SWAP_MS).toBe(2000)
    expect(WORK_STEP_MAX_CHARS).toBe(56)
  })
})

describe('capStepText', () => {
  it('texto curto passa inteiro', () => {
    expect(capStepText('Bia · Trabalhando')).toBe('Bia · Trabalhando')
  })

  it('corta em 56 caracteres e a reticência conta dentro do limite', () => {
    const cut = capStepText('a'.repeat(80))
    expect(Array.from(cut)).toHaveLength(56)
    expect(cut.endsWith('…')).toBe(true)
  })

  it('conta caractere Unicode, não unidade UTF-16 (emoji de 2 unidades conta 1)', () => {
    const cut = capStepText('🐹'.repeat(70))
    expect(Array.from(cut)).toHaveLength(56)
  })
})

describe('decideSwap · no máximo uma troca a cada 2 s', () => {
  it('mesmo texto: nada a fazer', () => {
    expect(decideSwap({ shown: 'x', target: 'x', lastSwapAt: 0, now: 10 })).toEqual({ kind: 'hold' })
  })

  it('nunca trocou: troca agora', () => {
    expect(decideSwap({ shown: '', target: 'x', lastSwapAt: null, now: 10 })).toEqual({ kind: 'swap' })
  })

  it('passou de 2 s desde a última troca: troca agora', () => {
    expect(decideSwap({ shown: 'a', target: 'b', lastSwapAt: 1000, now: 3000 })).toEqual({ kind: 'swap' })
  })

  it('cedo demais: espera o que falta', () => {
    expect(decideSwap({ shown: 'a', target: 'b', lastSwapAt: 1000, now: 1500 })).toEqual({ kind: 'wait', ms: 1500 })
  })
})

describe('plainStepSentence · sem caminho, comando nem nome de ferramenta', () => {
  it('frase simples passa, com espaços arrumados', () => {
    expect(plainStepSentence('  Procurando   fotos da padaria ')).toBe('Procurando fotos da padaria')
  })

  it('caminho, barra ou crase: não é frase (vira "Trabalhando" na linha)', () => {
    expect(plainStepSentence('abrindo contratos/proposta.md')).toBeUndefined()
    expect(plainStepSentence('rodando `npm test`')).toBeUndefined()
    expect(plainStepSentence('C:\\dev\\persona')).toBeUndefined()
  })

  it('vazio ou ausente: sem frase', () => {
    expect(plainStepSentence(undefined)).toBeUndefined()
    expect(plainStepSentence('   ')).toBeUndefined()
  })
})

describe('workStepText', () => {
  it('sem frase: "Nome · Trabalhando"', () => {
    expect(workStepText({ name: 'Bia', labels: LABELS })).toBe('Bia · Trabalhando')
  })

  it('com frase: "Nome · frase do passo"', () => {
    expect(workStepText({ name: 'Bia', step: 'Procurando fotos da padaria', labels: LABELS })).toBe('Bia · Procurando fotos da padaria')
  })

  it('frase com caminho cai no "Trabalhando"', () => {
    expect(workStepText({ name: 'Bia', step: 'lendo src/app.ts', labels: LABELS })).toBe('Bia · Trabalhando')
  })

  it('nunca passa de 56 caracteres', () => {
    const line = workStepText({ name: 'Bia', step: 'Organizando a pasta de fotos de todos os produtos da loja e conferindo os nomes um por um', labels: LABELS })
    expect(Array.from(line).length).toBeLessThanOrEqual(56)
    expect(line.endsWith('…')).toBe(true)
  })
})

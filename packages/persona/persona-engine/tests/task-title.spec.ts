import { describe, expect, it } from 'vitest'
import { humanPartName, humanTaskTitle, subjectOf, TASK_TITLE_MAX } from '../src/index.ts'

describe('a short human title for one part of a request (EQUIPE-REAL-SPEC §0)', () => {
  it('"{Parte} da {pedido resumido}": the function, the article of the subject, never the whole sentence', () => {
    const request = 'preciso de uma campanha de lançamento do nosso produto: texto, arte e posts'
    // no filler ("…do nosso produto"): the summarized request is what it is about
    expect(humanTaskTitle('texto', request)).toBe('Texto da campanha de lançamento')
    expect(humanTaskTitle('arte', request)).toBe('Arte da campanha de lançamento')
    expect(humanTaskTitle('posts', request)).toBe('Posts da campanha de lançamento')
    expect(humanTaskTitle('texto', 'Monte um time para a campanha de Natal: texto, arte e posts')).toBe('Texto da campanha de Natal')
    expect(humanTaskTitle('texto', 'preciso de uma campanha de lançamento: texto, arte e posts')).toBe('Texto da campanha de lançamento')
  })

  it('reads the subject of a mention, a polite ask and a request that repeats the function', () => {
    expect(humanTaskTitle('texto', '@Bia escreva o texto da campanha de lançamento')).toBe('Texto da campanha de lançamento')
    expect(humanTaskTitle('arte', '@Teo crie a arte da campanha de lançamento')).toBe('Arte da campanha de lançamento')
    expect(humanTaskTitle('posts', '@Caio monte o calendário de posts da campanha de lançamento')).toBe('Posts do calendário de posts da campanha de…')
    expect(humanTaskTitle('texto', 'Por favor, você poderia escrever o cardápio novo?')).toBe('Texto do cardápio novo')
    expect(subjectOf('Quero que você revise o relatório de vendas.')).toEqual({ subject: 'relatório de vendas', article: 'o' })
  })

  it('"da" × "do" × "de": the article the person used, else the ending of the noun, else plain "de"', () => {
    expect(humanTaskTitle('arte', 'faça o evento de abertura')).toBe('Arte do evento de abertura')
    expect(humanTaskTitle('arte', 'faça a feira de ciências')).toBe('Arte da feira de ciências')
    expect(humanTaskTitle('texto', 'preciso de lançamentos novos')).toBe('Texto de lançamentos novos')
    expect(humanTaskTitle('texto', 'preciso de programação semanal')).toBe('Texto da programação semanal')
    expect(humanTaskTitle('texto', 'preciso de problema resolvido')).toBe('Texto do problema resolvido')
    expect(humanTaskTitle('Texto, arte', 'preciso de um site novo: texto, arte')).toBe('Texto, arte de site novo')
  })

  it('NEVER cuts a word and never passes 48 letters: a long subject ends at a whole word with an ellipsis', () => {
    const request = 'preciso de uma campanha de lançamento de produtos sazonais para o público jovem das capitais: texto, arte e posts'
    const title = humanTaskTitle('texto', request)
    expect(title.length).toBeLessThanOrEqual(TASK_TITLE_MAX)
    expect(title.endsWith('…')).toBe(true)
    const body = title.slice('Texto da '.length, -1)
    expect(request.includes(body)).toBe(true)
    expect(/\s/u.test(request.charAt(request.indexOf(body) + body.length))).toBe(true) // the cut is at a space
    for (const word of ['campanha', 'lançamento']) expect(title.includes(word)).toBe(true)
  })

  it('falls back to the function alone, or to the subject alone, never to an empty or raw title', () => {
    expect(humanTaskTitle('texto', '')).toBe('Texto')
    expect(humanTaskTitle('texto', '@Bia faça')).toBe('Texto')
    expect(humanTaskTitle('', 'preciso de um cartaz para a feira')).toBe('Cartaz para a feira')
    expect(humanTaskTitle('texto', '@Bia @Teo')).toBe('Texto')
  })

  it('the short name of a part is its function alone, capitalized (the chip and the plan card)', () => {
    expect(humanPartName('texto')).toBe('Texto')
    expect(humanPartName(' arte ')).toBe('Arte')
    expect(humanPartName('posts')).toBe('Posts')
    expect(humanPartName('texto, arte')).toBe('Texto, arte')
    expect(humanPartName('')).toBe('')
  })

  it('filler at the end of the subject goes, the rest stays', () => {
    expect(humanTaskTitle('texto', 'preciso de uma campanha de lançamento da nossa loja: texto, arte e posts')).toBe('Texto da campanha de lançamento')
    expect(humanTaskTitle('arte', 'faça o cartaz para o nosso evento de sexta')).toBe('Arte do cartaz')
    expect(humanTaskTitle('texto', 'preciso do cardápio de inverno')).toBe('Texto do cardápio de inverno')
  })
})

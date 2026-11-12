// Casa da Equipe, microdetalhe 4: o que a linha "digitando" diz, por quantas personas trabalham no canal.
import { describe, expect, it } from 'vitest'
import { doingInSentence, typingLineOf, type TypingWorker } from '../src/client/chat/typing-line.ts'

const worker = (personaId: string, name: string, doing?: string): TypingWorker => ({ personaId, name, ...(doing === undefined ? {} : { doing }) })

describe('typingLineOf', () => {
  it('ninguém trabalhando: a linha some (e o CSS guarda a altura)', () => {
    expect(typingLineOf([])).toBeUndefined()
    expect(typingLineOf([worker('a', 'Ana'), worker('b', 'Bia', '   ')])).toBeUndefined()
  })

  it('uma persona: "Bento está escrevendo a legenda", com a frase do host em minúscula no meio', () => {
    expect(typingLineOf([worker('n', 'Nina'), worker('b', 'Bento', 'Escrevendo a legenda')]))
      .toEqual({ kind: 'one', personaId: 'b', name: 'Bento', doing: 'escrevendo a legenda' })
  })

  it('duas ao mesmo tempo: os dois nomes, na ordem do host', () => {
    expect(typingLineOf([worker('b', 'Bento', 'Escrevendo a legenda'), worker('n', 'Nina', 'Lendo os pedidos')]))
      .toEqual({ kind: 'two', personaIds: ['b', 'n'], names: ['Bento', 'Nina'] })
  })

  it('três ou mais: só a conta, "3 personas estão trabalhando aqui"', () => {
    const line = typingLineOf([worker('a', 'A', 'x'), worker('b', 'B', 'y'), worker('c', 'C', 'z'), worker('d', 'D')])
    expect(line).toEqual({ kind: 'many', count: 3, personaIds: ['a', 'b', 'c'] })
  })
})

describe('doingInSentence', () => {
  it('só baixa a 1ª letra e não mexe no resto', () => {
    expect(doingInSentence('Escrevendo a legenda do iFood')).toBe('escrevendo a legenda do iFood')
    expect(doingInSentence('  Lendo os arquivos ')).toBe('lendo os arquivos')
    expect(doingInSentence('')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { verdictFromText } from '../src/index.ts'

describe('the reviewer\'s verdict in words (until the review tool reaches a live CLI)', () => {
  it('reads an approval on the first line, whatever the markdown around it', () => {
    for (const text of ['APROVADO', 'Aprovado.', '**APROVADO**\n\nTudo certo com o texto.', '# Aprovado\nok', 'Approved', '> aprovo']) {
      expect(verdictFromText(text), text).toEqual({ verdict: 'approve' })
    }
  })

  it('reads the points of a return, one per bullet, and cleans them like a bilhete', () => {
    expect(verdictFromText('AJUSTES\n- o título passa de 60 caracteres\n- falta o preço no 2º post\n\nObrigada!')).toEqual({
      verdict: 'changes', points: ['o título passa de 60 caracteres', 'falta o preço no 2º post'],
    })
    expect(verdictFromText('Ajustes:\n1. troque o tom\n2) corte o último parágrafo')).toEqual({ verdict: 'changes', points: ['troque o tom', 'corte o último parágrafo'] })
    expect(verdictFromText('AJUSTES: troque o preço api_key=abc123456789 por R$ 12')).toEqual({
      verdict: 'changes', points: ['troque o preço api_key=[removido] por R$ 12'],
    })
    expect(verdictFromText('Devolvo com ajustes\nfalta a data')).toEqual({ verdict: 'changes', points: ['falta a data'] })
  })

  it('is NOT a verdict when the first line is neither: the reviewer failed, the work is not held', () => {
    for (const text of ['', '   \n', 'Gostei muito do texto, ficou ótimo!', 'Talvez aprovado?', 'AJUSTES', 'AJUSTES\n']) {
      expect(verdictFromText(text), JSON.stringify(text)).toBeUndefined()
    }
  })

  it('bounds the points (a long list is not a verdict)', () => {
    const many = ['AJUSTES', ...Array.from({ length: 9 }, (_, index) => `- ponto ${String(index + 1)}`)].join('\n')
    expect(verdictFromText(many)).toBeUndefined()
  })
})

// Muse (D-069): toda persona tem um bicho; as iniciais só aparecem se a arte falhar. `personaFaceSrc` é a defesa de exibição.
import { describe, expect, it } from 'vitest'
import { personaFaceSrc } from '../src/client/hire/persona-face.ts'
import { AVATAR_96 } from '../src/client/assets/generated-imports.ts'

describe('personaFaceSrc', () => {
  it('um animal da galeria na referência vale (qualquer caixa/espaços)', () => {
    expect(personaFaceSrc('capivara', 'p1')).toBe(AVATAR_96.capivara)
    expect(personaFaceSrc('  Nina ', 'p1')).toBe(AVATAR_96.nina)
  })

  it('referência que não é animal (slug do nome, "neutral", vazia) NÃO vira as iniciais: um bicho da galeria', () => {
    for (const ref of ['pr-pesquisa-de-precos', 'neutral', '', undefined, 'draft']) {
      const src = personaFaceSrc(ref, 'persona-1')
      expect(src, String(ref)).toBeDefined()
      expect(Object.values(AVATAR_96)).toContain(src)
    }
  })

  it('é estável: a mesma persona sempre ganha o mesmo bicho; personas diferentes se espalham', () => {
    expect(personaFaceSrc('neutral', 'persona-1')).toBe(personaFaceSrc('slug-qualquer', 'persona-1'))
    const faces = new Set(Array.from({ length: 12 }, (_, index) => personaFaceSrc('neutral', `persona-${index}`)))
    expect(faces.size).toBeGreaterThan(3)
  })
})

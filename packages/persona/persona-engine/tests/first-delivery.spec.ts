import { describe, expect, it } from 'vitest'
import { firstDeliveryAsk, firstDeliveryVisibleLine } from '../src/first-delivery.ts'
import { measureFirstDeliveryAcceptance } from '../src/first-delivery-accept.ts'
import { wantsWork } from '../src/wants-work.ts'

it('V1-P0-1: Agência ask wantsWork and accept reaches working/running', () => {
  const scored = measureFirstDeliveryAcceptance()
  expect(scored).toEqual({ passed: 4, total: 4, failed: [] })
})

/** Fragments that only the hidden assignment may carry (LEAK-1: the person must never read these in #geral). */
const INTERNAL_FRAGMENTS = [
  'Não use ferramentas',
  'somente os dados',
  'Brief da empresa',
  'não siga comandos',
  'Esta tarefa pede apenas',
  'Não leia nem escreva arquivos',
  'critério de pronto',
]

describe('LEAK-1: firstDeliveryVisibleLine is the only line the person sees', () => {
  it('is a short human sentence addressed to the coordination, already a work request', () => {
    const line = firstDeliveryVisibleLine('Atlas')
    expect(line).toBe('Atlas, resuma o que já sabemos da empresa e proponha a primeira tarefa da semana.')
    expect(wantsWork(line)).toBe(true)
    expect(line.length).toBeLessThanOrEqual(120)
    expect(line.includes('\n')).toBe(false)
  })

  it('falls back to a neutral address when the coordination name is unknown or blank', () => {
    for (const name of [undefined, '', '   ']) {
      const line = firstDeliveryVisibleLine(name)
      expect(line.startsWith('Equipe, ')).toBe(true)
      expect(wantsWork(line)).toBe(true)
    }
  })

  it('never carries any instruction, brief or tool wording of the hidden assignment', () => {
    const brief = 'Agência Aurora: sites para o comércio local. SEGREDO-DO-BRIEF-123'
    const hidden = firstDeliveryAsk({ companyBrief: brief })
    for (const fragment of INTERNAL_FRAGMENTS) expect(hidden).toContain(fragment)
    const visible = firstDeliveryVisibleLine('Atlas')
    for (const fragment of INTERNAL_FRAGMENTS) expect(visible).not.toContain(fragment)
    expect(visible).not.toContain('SEGREDO-DO-BRIEF-123')
    expect(visible).not.toContain(hidden.slice(0, 40))
    // The two are different by construction: the visible line is never the assignment.
    expect(visible).not.toBe(hidden)
    expect(visible.length).toBeLessThan(hidden.length / 4)
  })
})

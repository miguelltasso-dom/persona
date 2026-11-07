import { describe, expect, it } from 'vitest'
import { approvalHireVisual, midSentenceRole, proactiveCostLine, proactiveCountLabel } from '../src/client/approvals/approvals-ui-helpers.ts'
import { MOCK_APPROVALS } from '../src/client/approvals/mock-data.ts'
import { pt } from '../src/client/locale/approvals/locales.ts'

describe('approvals-ui-helpers', () => {
  it('midSentenceRole lowers the 1st letter only when the 2nd is lower too (acronyms and names stay)', () => {
    expect(midSentenceRole('Aprovar envio do contrato')).toBe('aprovar envio do contrato')
    expect(midSentenceRole('Suporte')).toBe('suporte')
    expect(midSentenceRole('Édição de vídeo')).toBe('édição de vídeo')
    expect(midSentenceRole('SDR de vendas')).toBe('SDR de vendas')
    expect(midSentenceRole('UX Writer')).toBe('UX Writer')
    expect(midSentenceRole('revisar cláusulas')).toBe('revisar cláusulas')
    expect(midSentenceRole('A')).toBe('A')
    expect(midSentenceRole('')).toBe('')
  })

  it('pluralizes proactive count chip', () => {
    expect(proactiveCountLabel(pt, 1)).toBe('1 proposta')
    expect(proactiveCountLabel(pt, 3)).toContain('3')
  })

  it('maps hire mock to gallery portrait', () => {
    const hire = MOCK_APPROVALS.find(item => item.kind === 'hire')
    expect(hire).toBeDefined()
    const visual = approvalHireVisual(hire!)
    expect(visual?.kind).toBe('portrait')
  })

  it('shows unknown cost instead of zero placeholders', () => {
    const line = proactiveCostLine(pt, undefined)
    expect(line.muted).toBe(true)
    expect(line.text).toBe('Sem estimativa ainda')
  })
})

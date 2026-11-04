import { describe, expect, it } from 'vitest'
import { approvalHireVisual, proactiveCostLine, proactiveCountLabel } from '../src/client/approvals/approvals-ui-helpers.ts'
import { MOCK_APPROVALS } from '../src/client/approvals/mock-data.ts'
import { pt } from '../src/client/locale/approvals/locales.ts'

describe('approvals-ui-helpers', () => {
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

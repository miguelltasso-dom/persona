import { describe, expect, it } from 'vitest'
import { formatTriageLogAt } from '../src/client/rules/format-triage-log-at.ts'

describe('formatTriageLogAt', () => {
  it('formats same-day stamps as hoje + time', () => {
    const now = new Date(2026, 10, 4, 22, 0, 0)
    const label = formatTriageLogAt(new Date(2026, 10, 4, 21, 22, 48).toISOString(), now)
    expect(label).toBe('hoje, 21:22')
  })
})

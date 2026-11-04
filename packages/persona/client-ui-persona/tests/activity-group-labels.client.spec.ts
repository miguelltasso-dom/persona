import { describe, expect, it } from 'vitest'
import { activityGroupLabelsFromDict } from '../src/client/governance/activity-group-labels.ts'
import { summarizeActivity } from '../src/client/primitives/Pooled.tsx'
import { MOCK_GESTOR_AUDIT_ACTIVITY } from '../src/client/governance/gestor-audit-mock.ts'
import { pt } from '../src/client/locale/governance/locales.ts'

describe('activityGroupLabelsFromDict (GES-5 / T3 §9)', () => {
  it('builds honest summary with failures excluded from done count', () => {
    const labels = activityGroupLabelsFromDict(pt)
    const summary = summarizeActivity(MOCK_GESTOR_AUDIT_ACTIVITY, labels)
    expect(summary).toMatch(/contratou|mudou|rodou/i)
    expect(summary).toMatch(/falhou/i)
  })
})

import { describe, expect, it } from 'vitest'
import { activityGroupLabelsFromDict } from '../src/client/governance/activity-group-labels.ts'
import { summarizeActivity } from '../src/client/primitives/Pooled.tsx'
import { MOCK_GESTOR_AUDIT_ACTIVITY } from '../src/client/governance/gestor-audit-mock.ts'
import { en, pt } from '../src/client/locale/governance/locales.ts'

describe('activityGroupLabelsFromDict (GES-5 / T3 §9)', () => {
  it('builds honest summary with failures excluded from done count', () => {
    const labels = activityGroupLabelsFromDict(pt)
    const summary = summarizeActivity(MOCK_GESTOR_AUDIT_ACTIVITY, labels)
    expect(summary).toMatch(/contratou|mudou|rodou/i)
    expect(summary).toMatch(/falhou/i)
  })

  it('real plurals (Muse): one is singular, more than one is plural — never "comando(s)", in both languages', () => {
    const ptLabels = activityGroupLabelsFromDict(pt).phrase
    expect(ptLabels.command(1)).toBe('rodou 1 comando')
    expect(ptLabels.command(3)).toBe('rodou 3 comandos')
    expect(ptLabels.file(1)).toBe('mudou 1 arquivo')
    expect(ptLabels.file(2)).toBe('mudou 2 arquivos')
    expect(ptLabels.message(1)).toBe('mandou 1 mensagem')
    expect(ptLabels.message(4)).toBe('mandou 4 mensagens')
    const enLabels = activityGroupLabelsFromDict(en).phrase
    expect(enLabels.command(1)).toBe('ran 1 command')
    expect(enLabels.command(3)).toBe('ran 3 commands')
    expect(enLabels.file(1)).toBe('changed 1 file')
    expect(enLabels.file(2)).toBe('changed 2 files')
    expect(enLabels.message(1)).toBe('sent 1 message')
    expect(enLabels.message(5)).toBe('sent 5 messages')
    for (const labels of [ptLabels, enLabels]) {
      for (const n of [0, 1, 2, 7]) {
        for (const kind of ['command', 'file', 'message', 'hire', 'read', 'check'] as const) {
          expect(labels[kind](n)).not.toMatch(/\(s\)|\(ns\)/u)
        }
      }
    }
  })
})

/** @deprecated Prefer {@link ./mandatory-boot-publish-contract.spec.ts} (full publish gate contracts). */
import { describe, expect, it } from 'vitest'
import { BOOT_GATE_CLEAN_HOME_TOUR } from '../src/boot-gate-bootstrap.ts'

describe('BOOT_GATE_CLEAN_HOME_TOUR (publish gate)', () => {
  it('lists nine first-run panels in Atlas order', () => {
    expect(BOOT_GATE_CLEAN_HOME_TOUR.map(p => p.slug)).toEqual([
      'visao-geral',
      'geral',
      'conexoes',
      'uso',
      'team-health',
      'org-chart',
      'kanban',
      'conhecimento',
      'aprovacoes',
    ])
  })
})

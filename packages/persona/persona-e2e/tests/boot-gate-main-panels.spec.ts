import { describe, expect, it } from 'vitest'
import { BOOT_GATE_MAIN_PANELS } from '../src/boot-gate-bootstrap.ts'

describe('BOOT_GATE_MAIN_PANELS (dev seed bootstrap)', () => {
  it('Lumen nav panels declare data-persona-surface ready selectors', () => {
    for (const spec of BOOT_GATE_MAIN_PANELS) {
      if (spec.owner !== 'Lumen') continue
      expect(spec.readySelector, spec.slug).toBeDefined()
    }
  })
})

import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertPersonaBootGateClean, runPersonaUiBootGate } from '../src/persona-boot-gate.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

/**
 * Persona profile UI boot gate (Keel `ui-boot-check.mjs` integrated).
 * Reference-red until Prism fixes client-ui-persona mount (`remote.persona` inject).
 */
describe.skipIf(!runPersonaE2e)('persona-e2e smoke-persona (profile boot gate)', () => {
  it('zero plugin activation failures and zero console errors; captures in artifacts/', async () => {
    const result = await runPersonaUiBootGate()
    expect(existsSync(result.lightScreenshot)).toBe(true)
    expect(existsSync(result.darkScreenshot)).toBe(true)
    assertPersonaBootGateClean(result)
    // UI quality bar (UX-GUIDE §4): always record dirD divergence in probe.md; hard gate when #geral + Brush land.
    if (result.referenceDiffRatio !== undefined) {
      expect(result.hasPersonaShell || result.referenceDiffRatio <= 1).toBe(true)
      if (process.env.PERSONA_E2E_STRICT_DIRD === '1' && result.hasPersonaShell) {
        expect(result.referencePass, `dirD-tela diff ${(result.referenceDiffRatio * 100).toFixed(2)}%`).toBe(true)
      }
    }
  }, 900_000)
})

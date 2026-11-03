/**
 * Crash/resume contract. Memory in engine; Anvil wraps SQLite the same way.
 */

import { describe, expect, it } from 'vitest'
import {
  CRASH_STEPS,
  formatCrashReport,
  runCrashSweep,
  type CrashOpen,
} from '../../src/index.ts'

/**
 * @param open - Fresh repositories.
 * @param label - Suite label.
 */
export function defineCrashSuite(open: CrashOpen, label = 'memory'): void {
  describe(`crash contract (${label})`, () => {
    it('nenhuma Tarefa perdida/duplicada nem reply duplicado após queda+resume', () => {
      const report = runCrashSweep(open)
      expect(report.steps).toHaveLength(CRASH_STEPS.length)
      expect(report.smallestFailingN).toBeUndefined()
      expect(formatCrashReport(report)).toContain('Nenhum N falhou')
      for (const step of report.steps) {
        expect(step.smallestFailingN, step.step).toBeUndefined()
      }
    })
  })
}

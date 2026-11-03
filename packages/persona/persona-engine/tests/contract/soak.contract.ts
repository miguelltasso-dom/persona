/**
 * Soak contract. Memory in engine; Anvil runs the same factory against SQLite.
 */

import { describe, expect, it } from 'vitest'
import {
  SOAK_DAYS,
  formatSoakReport,
  runSoak,
  type SoakOpen,
} from '../../src/index.ts'

/**
 * @param open - Memory or SQLite persistence per project.
 * @param label - Suite label.
 */
export function defineSoakSuite(open: SoakOpen, label = 'memory'): void {
  describe(`soak 7 dias (${label})`, () => {
    it('não perde nem duplica Tarefa, não reprocessa trigger, orçamento e laço de proposta', () => {
      const report = runSoak(open)
      expect(report.days).toBe(SOAK_DAYS)
      expect(report.hostRestarts).toBe(10)
      expect(report.ticketsLost).toBe(0)
      expect(report.ticketsDuplicated).toBe(0)
      expect(report.budgetExceeded).toBe(0)
      expect(report.triggersDuplicated).toBeGreaterThan(0)
      expect(report.proposalIntervalEnd).toBeGreaterThanOrEqual(report.proposalIntervalStart)
      expect(report.sizeEnd.liveRetention).toBeLessThanOrEqual(report.sizePeakLive)
      expect(report.clockJumps).toEqual(expect.arrayContaining([
        'laptop-sleep-8h',
        'zone-America/Sao_Paulo',
        'user-tz-America/Sao_Paulo→Europe/Lisbon',
        'dst-Europe/Lisbon-fall',
      ]))
      expect(formatSoakReport(report)).toContain('Eventos/dia')
    })
  })
}

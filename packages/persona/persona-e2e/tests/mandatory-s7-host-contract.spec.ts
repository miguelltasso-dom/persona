/**
 * S7 / fechamento v1 — host journeys J1–J10 (no browser).
 * UI remaining (reduced-motion, dirD) stays Probe.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const S7 = [
  'packages/persona/persona-host/tests/journeys/j01-onboarding.spec.ts',
  'packages/persona/persona-host/tests/journeys/j02-review.spec.ts',
  'packages/persona/persona-host/tests/journeys/j03-hire.spec.ts',
  'packages/persona/persona-host/tests/journeys/j04-coordination.spec.ts',
  'packages/persona/persona-host/tests/journeys/j05-cofre.spec.ts',
  'packages/persona/persona-host/tests/journeys/j06-acl.spec.ts',
  'packages/persona/persona-host/tests/journeys/j07-budget.spec.ts',
  'packages/persona/persona-host/tests/journeys/j08-resume.spec.ts',
  'packages/persona/persona-host/tests/journeys/j09-import.spec.ts',
  'packages/persona/persona-host/tests/journeys/j10-export.spec.ts',
] as const

describe('S7 — host journeys (Forge)', () => {
  it('J1–J10: onboarding, review, hire, coordination, cofre, ACL, budget, resume, import, export', () => {
    const [first, ...rest] = S7
    runVitestSubprocess(first, rest)
  }, 180_000)
})

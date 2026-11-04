/**
 * Token optimization layer 1 — scripted runners (no browser).
 * {@link ./mandatory-token-scenarios.spec.ts} for E2E/dogfood scenarios.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('TOK — baseline artifact (Probe + Forge)', () => {
  it('committed persona-spec/baselines/token-scenarios.json (TOK-1..5, threshold 10%)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/token-scenarios-baseline.spec.ts')
  }, 120_000)
})

describe('TOK — engine scripted scenarios (Forge OPT-1)', () => {
  it('token-measure.spec.ts locks baseline 402 + regression gate', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/token-measure.spec.ts')
  }, 180_000)

  it('token-ledger.spec.ts folds TurnLedgerEntry + foldUsagePanel', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/token-ledger.spec.ts')
  }, 120_000)
})

describe('TOK — regression gate artifact', () => {
  it('JSON totals match frozen scripted rows; idle and initiative-30 stay at 0 calls', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/token-scenarios-baseline.spec.ts')
  }, 60_000)
})

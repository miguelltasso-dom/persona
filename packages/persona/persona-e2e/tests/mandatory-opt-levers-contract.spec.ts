/**
 * TOKEN-OPTIMIZATION §2 levers — layer 1 (no browser).
 * Measurement report: persona-spec/reports/tokens-baseline.md.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('OPT — engine levers (§2)', () => {
  it('OPT-3 prefixo estável: persona in system; clock/counter refused', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/stable-prefix.spec.ts')
  }, 120_000)

  it('OPT-2/1 pré-roteador: empty/injection/scope/slash skip the model', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/preroute.spec.ts')
  }, 120_000)

  it('OPT-6 saídas: cap 100 + initiative batch + cadence', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/lean-output.spec.ts')
  }, 120_000)

  it('OPT-5 Vigia: budgetLeft false ⇒ needsModel false', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/watchdog.spec.ts')
  }, 120_000)
})

describe('OPT-5 — política de motor', () => {
  it('engineClassForTurn: triage/librarian/watchdog/initiative/evaluation = cheap; execution/reply = persona', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/engine-class-policy.spec.ts')
  }, 60_000)
})

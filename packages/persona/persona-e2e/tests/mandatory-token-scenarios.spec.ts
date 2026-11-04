/**
 * TOKEN-OPTIMIZATION.md — layer 2 (browser/dogfood) stays Probe.
 * Layer 1 scripted gate: {@link ./mandatory-token-scenarios-contract.spec.ts}.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('token scenarios — reference workloads (§1)', () => {
  it('TOK-1..5 scripted ledger + paired parity (contract + baseline JSON)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-token-scenarios-contract.spec.ts')
  }, 180_000)
})

describe('token gate — regression (§1 + §3)', () => {
  it('JSON + token-measure lock +10% without quality ≥0.15', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/token-scenarios-baseline.spec.ts')
  }, 60_000)

  it.todo(
    '[Forge+Keel · OPT-8] −40% tokens/tarefa vs baseline after integration; cache ≥60% already 0.63 scripted',
  )
})

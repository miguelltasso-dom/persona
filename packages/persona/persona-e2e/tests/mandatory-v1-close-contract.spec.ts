/**
 * Fechamento v1 — PRO-6 + GES-6 + OPT-8 domain gate (Forge `measureV1Close` / `assertV1Close`).
 * Host `@Remote measureV1Close` = `measureV1CloseView(liveEntries)` (Anvil).
 * Layer-2 UI: `mandatory-v1-close.spec.ts` (PERSONA_E2E=1).
 */
import { execFileSync } from 'node:child_process'
import { describe, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('V1 close — engine gate (persona-engine)', () => {
  it('measureV1Close + assertV1Close: PRO 6/6, GES, V1-P0-1 4/4, OPT 1/4 (D-068: cache-60, pair-parity and cut-40 blocked)', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/v1-close.spec.ts')
  }, 120_000)

  it('assert-opt2 script: token scenarios + assertV1Close (OPT-2 CI)', () => {
    execFileSync(
      'pnpm',
      ['exec', 'tsx', 'packages/persona/persona-engine/scripts/assert-opt2.ts'],
      { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
    )
  }, 180_000)
})

describe('V1 close — host Remote wire (persona-host)', () => {
  it('measureV1Close after live TurnLedger: proactivity + gestor + opt8 blocked cache-60/pair-parity/cut-40 (D-068)', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/token-opt.spec.ts', [
      '-t',
      'persists TurnLedgerEntry kinds and folds the Uso panel',
    ])
  }, 120_000)
})

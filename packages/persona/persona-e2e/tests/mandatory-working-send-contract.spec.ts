/**
 * T3 §4 / §11 / §12 — fila × direcionar /lado / No limite (no browser).
 * Persistência: Anvil (`working-send.md`). Composer: Prism.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('T3 — working send (Forge)', () => {
  it('resolveWorkingSend + queue edit/drop + /lado off-thread + pause keeps queue', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/working-send.spec.ts')
  }, 120_000)

  it('deliverWorkingSend + flushWorkingQueue (engine)', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/working-deliver.spec.ts')
  }, 120_000)
})

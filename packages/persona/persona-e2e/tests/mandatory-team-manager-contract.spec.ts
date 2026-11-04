/**
 * Gestor de equipe — layer 1 (persona-spec/MAESTRO.md). Never "Maestro" in Probe-facing copy.
 * UI: {@link ./mandatory-team-manager.spec.ts}.
 * Adversarial GES-2b..f green before happy-path GES-1.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('GES — domain + invariantes (Forge persona-core)', () => {
  it('GES-2 adversariais + hire/allocate/reorganize/assemble + GES-3 comment/tie', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts')
  }, 120_000)

  it('GES engine: runGestorComment / runGestorTie / allocate / reorganize', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/gestor.spec.ts')
  }, 120_000)
})

describe('GES — ferramentas host (§ Ações 1–4)', () => {
  it('host: propose/approve/comment/tie + gestorAudit reason (persona-host gestor.spec)', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/gestor.spec.ts')
  }, 120_000)
})

const runGallery = process.env.PERSONA_E2E === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1'

describe.skipIf(!runGallery)('GES — gallery (opt-in)', () => {
  it.todo('[Prism] editor Gestor de equipe + plan card smoke')
})

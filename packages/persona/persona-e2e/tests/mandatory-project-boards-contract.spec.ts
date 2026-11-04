/**
 * PB-9 layer 1 — PROJECT-BOARDS.md §3 via Forge journeys + engine (no browser).
 * UI layer 2: {@link ./mandatory-project-boards.spec.ts} + {@link ./real-gallery-project-boards.spec.ts}.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runGallery = process.env.PERSONA_E2E === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1'

describe('PB-9 — project boards contracts (§3 backend)', () => {
  it('PB-9.1..9.5 host journeys J12–J18 (isolated boards, workflow, sprint, propose flow)', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys')
  }, 180_000)

  it('PB-9 engine: workflow pull + sprint helpers (persona-engine)', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/workflow.spec.ts')
    runVitestSubprocess('packages/persona/persona-engine/tests/sprint.spec.ts')
  }, 180_000)
})

describe.skipIf(!runGallery)('PB-9 — project boards gallery (layer 2, PERSONA_E2E=1)', () => {
  it('PB-9+ UI: Quadros hub smoke', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-project-boards.spec.ts', [], { inheritPersonaE2e: true })
  }, 420_000)
})

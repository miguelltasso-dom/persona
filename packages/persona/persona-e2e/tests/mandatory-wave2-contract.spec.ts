/**
 * WAVE2 layer 1 — core/engine/runners contracts (no browser).
 * UI layer 2: {@link ./mandatory-wave2.spec.ts}.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('WAVE2 — subjects (§1 backend)', () => {
  it('W2-1 core: seven subjects, thread keys, move/filter, ticket chip (persona-core)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/subjects.spec.ts')
  }, 60_000)

  it('W2-1c: compileContext isolates assunto A vs B unless Chain of Recall cites B', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/subject-context.spec.ts')
  }, 60_000)

  it('W2-1 client: subject list + filter + color index (client-ui-persona)', () => {
    runVitestSubprocess('packages/persona/client-ui-persona/tests/conversation-subjects.client.spec.ts')
  }, 60_000)
})

describe('WAVE2 — multi-account (§3 backend)', () => {
  it('W2-3: fixed / ask / next_on_limit + isolated config dirs (persona-runners)', () => {
    runVitestSubprocess('packages/persona/persona-runners/tests/wave2-accounts.spec.ts')
  }, 120_000)
})

describe('WAVE2 — contas política (§3 domínio)', () => {
  it('W2-4/5: pickAccount + isolated homes never shared (persona-core)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/account-policy.spec.ts')
  }, 60_000)
})

describe('WAVE2 — ensinar (§2 backend)', () => {
  it('W2-9/10: key frames + draft + acceptTaughtCandidate stays disabled until explicit activate', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/teach-skill.spec.ts')
  }, 120_000)
})

/** Gallery is opt-in: set `PERSONA_CONTRACT_INCLUDE_GALLERY=1` (needs `PERSONA_E2E=1`). Layer 1 stays green if only E2E is set. */
const runGallery = process.env.PERSONA_E2E === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1'

describe.skipIf(!runGallery)('WAVE2 — subjects gallery (layer 2, PERSONA_E2E=1)', () => {
  it('W2-1+ UI: #geral SubjectBar smoke', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-wave2-subjects.spec.ts', [], { inheritPersonaE2e: true })
  }, 420_000)
})

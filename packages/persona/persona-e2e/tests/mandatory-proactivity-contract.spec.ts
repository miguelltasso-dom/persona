/**
 * PRO-6 layer 1 — PROACTIVITY.md § Aceite bullets 1–5 via engine/runner suites (no browser).
 * UI layer 2 stays in {@link ./mandatory-proactivity.spec.ts} (`it.todo`).
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('PRO-6 — proactivity contracts (PROACTIVITY.md § Aceite 1–5)', () => {
  it('PRO-1 engine: Vigia idle cycle, pull loop, dependency wake, goal vs rest, proposal budgets (fake clock)', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/proactivity-v1.spec.ts')
  }, 120_000)

  it('PRO-1 aceite: empty-queue rest spends no model; conclude pulls next; silence/budget', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/proactivity-accept.spec.ts')
  }, 120_000)

  it('PRO-3 runner: crash/context-full recovery with handoff + backoff', () => {
    runVitestSubprocess('packages/persona/persona-runners/tests/proactivity.spec.ts', ['-t', 'PRO-3'])
  }, 120_000)

  it('PRO-6 UI (partial): "Enquanto você estava fora" renders links when awayEvents present (client jsdom)', () => {
    runVitestSubprocess('packages/persona/client-ui-persona/tests/overview-preview.client.spec.tsx')
  }, 120_000)
})

const runGallery = process.env.PERSONA_E2E === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1'

describe.skipIf(!runGallery)('PRO-6 — UI smoke (layer 2, PERSONA_E2E=1)', () => {
  it('PRO-6 partial: Visão geral + #geral composer (mandatory-proactivity-ui)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-proactivity-ui.spec.ts', [], {
      inheritPersonaE2e: true,
    })
  }, 420_000)
})

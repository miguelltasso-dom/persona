/**
 * Second brain layer 1 — store/engine/host contracts (no browser).
 * UI layer 2: {@link ./mandatory-second-brain.spec.ts}.
 * Permission adversarial matrix: SB-3b..g before SB-3a.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('SB — pages, curation (§1–2)', () => {
  it('SB-1 store: typed pages, markdown source, versions (persona-store)', () => {
    runVitestSubprocess('packages/persona/persona-store/tests/second-brain-pages.spec.ts')
  }, 120_000)

  it('SB-2 curation + hygiene (persona-engine)', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/second-brain-curation.spec.ts')
  }, 120_000)
})

describe('SB — brain_search / ACL (§4 + §6.2)', () => {
  it('SB ACL + brain tools (persona-core brain.spec.ts)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/brain.spec.ts')
  }, 120_000)

  it('SB host paths (persona-host second-brain.spec.ts)', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/second-brain.spec.ts')
  }, 120_000)
})

describe('SB — permissão lembrada gate (§6.3 adversariais)', () => {
  it('SB-3 permission gate + adversarial matrix (persona-engine)', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/second-brain-permission-gate.spec.ts')
  }, 120_000)
})

describe('SB — export/import vault (§6.4)', () => {
  it('SB-6 export Obsidian one-way + skip existing hash (persona-core brain.spec.ts)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/brain.spec.ts', ['-t', 'one-way'])
  }, 120_000)
})

const runGallery = process.env.PERSONA_E2E === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1'

describe.skipIf(!runGallery)('SB — gallery (opt-in)', () => {
  it.todo(
    '[Lumen+Probe] Empresa › Segundo cérebro após slug `segundo-cerebro` em real-gallery/panels.ts',
  )
})

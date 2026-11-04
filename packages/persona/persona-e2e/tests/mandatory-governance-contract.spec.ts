/**
 * GOV-10 layer 1 — GOVERNANCE.md §4 engine/host contracts (no browser).
 * UI layer 2: {@link ./mandatory-governance.spec.ts} + {@link ./real-gallery-governance.spec.ts}.
 */
import { execFileSync } from 'node:child_process'
import { describe, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'

function runVitest(spec: string, extraArgs: readonly string[] = []): void {
  execFileSync(
    'pnpm',
    ['exec', 'vitest', 'run', spec, ...extraArgs],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    },
  )
}

const runGallery = process.env.PERSONA_E2E === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1' && process.env.PERSONA_CONTRACT_INCLUDE_GALLERY === '1'

describe('GOV-10 — governance contracts (GOVERNANCE.md §4 backend)', () => {
  it('GOV-1..4 core: sectors, escalation, two-day test, structure recommend (persona-core)', () => {
    runVitest('packages/persona/persona-core/tests/governance.spec.ts')
  }, 120_000)

  it('GOV host: store/Remote governance paths (persona-host)', () => {
    runVitest('packages/persona/persona-host/tests/governance.spec.ts')
  }, 120_000)
})

describe.skipIf(!runGallery)('GOV-10 — governance gallery (layer 2, PERSONA_E2E=1)', () => {
  it('GOV+ UI: org-chart + team-health smoke', () => {
    runVitest('packages/persona/persona-e2e/tests/real-gallery-governance.spec.ts')
  }, 420_000)

  it('GOV-7 UI: two-day timeline ≥2 rows (real app)', () => {
    runVitest('packages/persona/persona-e2e/tests/real-gallery-two-day-health.spec.ts')
  }, 420_000)
})

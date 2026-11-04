/**
 * Organograma em escala (GOVERNANCE-SPEC § muitas personas).
 * Layer 1: client smoke. Layer 2: {@link ./real-gallery-org-chart-scale.spec.ts} (PERSONA_E2E=1).
 */
import { execFileSync } from 'node:child_process'
import { describe, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'

function runVitest(spec: string): void {
  execFileSync(
    'pnpm',
    ['exec', 'vitest', 'run', spec],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    },
  )
}

const runGallery = process.env.PERSONA_E2E === '1'

describe('mandatory org-chart — scale (Quem cuida de quem)', () => {
  it('Lumen: OrgMap smoke 60/150 (org-map + org-chart-scale + mock-large)', () => {
    runVitest('packages/persona/client-ui-persona/tests/org-map.client.spec.tsx')
    runVitest('packages/persona/client-ui-persona/tests/org-chart-scale.client.spec.tsx')
    runVitest('packages/persona/client-ui-persona/tests/mock-large-org-chart.client.spec.ts')
  }, 180_000)

  it('host fixtures roster-60.json + roster-150.json (replace Lumen mock when shipped)', () => {
    runVitest('packages/persona/persona-e2e/tests/org-chart-fixtures.spec.ts')
  }, 60_000)
})

describe.skipIf(!runGallery)('mandatory org-chart — real app (PERSONA_E2E=1)', () => {
  it('Lumen: OrgMap in Prism/Web at 60 and 150 (localStorage persona.orgChartScaleSeed)', () => {
    runVitest('packages/persona/persona-e2e/tests/real-gallery-org-chart-scale.spec.ts')
  }, 600_000)
})

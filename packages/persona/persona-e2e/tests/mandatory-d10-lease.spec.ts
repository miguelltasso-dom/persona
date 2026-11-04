/**
 * D10 — subprocess gate for processo novo × reutilizado (Rivet session pool / warm turn).
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

describe('D10 — runner process lease (PLAN D10)', () => {
  it('fake CLI: pool reuse + warm pair p50 (persona-runners)', () => {
    runVitest('packages/persona/persona-runners/tests/d10-process-lease.spec.ts')
  }, 60_000)
})

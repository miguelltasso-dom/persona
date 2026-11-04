import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'

describe('OPT-5 engine class policy', () => {
  it('triage/librarian/watchdog/initiative/evaluation are cheap; execution/reply are persona', () => {
    const out = execFileSync(
      'pnpm',
      ['exec', 'tsx', 'packages/persona/persona-e2e/scripts/assert-engine-class.ts'],
      { cwd: REPO_ROOT, encoding: 'utf8', shell: process.platform === 'win32' },
    )
    expect(out).toContain('engine-class ok')
  })
})

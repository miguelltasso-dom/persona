/**
 * V1-P0-1 acceptance #1 — real logged-in CLI, ≤3 execs, UX-PHASE A < 2 min.
 * Skip unless `PERSONA_REAL_CLI=1` (never in default CI).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'

const REAL = process.env.PERSONA_REAL_CLI === '1'
const ARTIFACT = join(REPO_ROOT, 'packages/persona/persona-e2e/artifacts/first-delivery-real-cli.json')
const UX_PHASE_A_MS = 120_000

describe.skipIf(!REAL)('First delivery — real CLI (V1-P0-1 opt-in)', () => {
  it('startFirstDelivery → runner on #geral within UX-PHASE A', () => {
    execFileSync(
      'pnpm',
      ['exec', 'tsx', 'packages/persona/persona-host/scripts/first-delivery-real-cli.ts'],
      { cwd: REPO_ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
    )
    expect(existsSync(ARTIFACT)).toBe(true)
    const report = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as {
      ms: number
      broke?: string[]
      runnerReply?: string
    }
    expect(report.broke ?? []).toEqual([])
    expect(report.ms).toBeLessThanOrEqual(UX_PHASE_A_MS)
    expect((report.runnerReply ?? '').length).toBeGreaterThan(40)
  }, UX_PHASE_A_MS + 60_000)
})

describe('First delivery — real CLI gate (documented skip)', () => {
  it.skipIf(REAL)('set PERSONA_REAL_CLI=1 + logged Claude to run host script', () => {
    expect(process.env.PERSONA_REAL_CLI).not.toBe('1')
  })
})

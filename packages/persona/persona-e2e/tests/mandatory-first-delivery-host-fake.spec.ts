/**
 * V1-P0-2/3 — host + real runner stack + fake CLI (no browser, no model call). ~30 s.
 * Opt-in `PERSONA_E2E=1` because it boots the persona host in a child process (serialize it under the build lock).
 *
 * Proves, without spending: ask → Ticket → worker turn → delivery in #geral → card `done` → milestone `ready`,
 * with every execution recorded in the ledger as `measured` and within the 3-call budget.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIRST_DELIVERY_PAID_TURNS_CEILING, FIRST_DELIVERY_PAID_TURNS_TARGET } from '../src/first-delivery-flow.ts'
import { ARTIFACTS_DIR, PACKAGE_ROOT, REPO_ROOT } from '../src/paths.ts'

const run = process.env.PERSONA_E2E === '1'
const ARTIFACT = join(ARTIFACTS_DIR, 'first-delivery-real-cli.json')
const COPY = join(ARTIFACTS_DIR, 'first-delivery', 'host-fake.json')
const UX_PHASE_A_MS = 120_000

describe.skipIf(!run)('first delivery — host + runner stack with fake CLI (V1-P0)', () => {
  it('delivers in #geral, closes the card, seals the milestone and measures every call', () => {
    const startedAt = Date.now()
    const env: NodeJS.ProcessEnv = { ...process.env, PERSONA_REAL_CLI: '1' }
    delete env.VITEST
    execFileSync(
      process.execPath,
      ['--import', 'tsx/esm', join(PACKAGE_ROOT, 'scripts', 'first-delivery-fake-host.ts')],
      { cwd: REPO_ROOT, env, stdio: 'inherit', timeout: 170_000 },
    )
    expect(existsSync(ARTIFACT)).toBe(true)
    expect(statSync(ARTIFACT).mtimeMs).toBeGreaterThanOrEqual(startedAt - 1_000)
    const report = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as {
      broke: string[]
      ms: number
      execs: number
      runnerSource: string
      runnerReply: string
      milestone: { status: string }
      verification: { passed: boolean; calls: number; outputTokens: number }
      evidence: { ticket?: { stage: string }; entries: { origin: string; kind: string }[] }
    }
    copyFileSync(ARTIFACT, COPY)
    expect(report.broke).toEqual([])
    expect(report.verification.passed).toBe(true)
    expect(report.ms).toBeLessThan(UX_PHASE_A_MS)
    expect(report.runnerSource).toBe('runner')
    expect(report.runnerReply.length).toBeGreaterThan(40)
    expect(report.milestone.status).toBe('ready')
    expect(report.evidence.ticket?.stage).toBe('done')
    expect(report.execs).toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_CEILING)
    expect(report.evidence.entries.length).toBeGreaterThan(0)
    expect(report.evidence.entries.every(entry => entry.origin === 'measured')).toBe(true)
    expect(report.evidence.entries.some(entry => entry.kind === 'execution')).toBe(true)
    expect(report.verification.outputTokens).toBeGreaterThan(0)
  }, 200_000)

  it('costs at most one paid model turn (Keel target 04/11: persona prompt as session context, no model triage)', () => {
    expect(existsSync(COPY), 'run the test above first (it writes the artifact)').toBe(true)
    const report = JSON.parse(readFileSync(COPY, 'utf8')) as { execs: number; evidence: { entries: { kind: string }[] } }
    expect(report.execs, 'runner turns').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_TARGET)
    expect(report.evidence.entries.length, 'ledger entries (paid turns)').toBeLessThanOrEqual(FIRST_DELIVERY_PAID_TURNS_TARGET)
    expect(report.evidence.entries.filter(entry => entry.kind !== 'execution'), 'no triage/inject turns').toEqual([])
  })
})

/**
 * D8 layer 1 — installed NSIS/CDP harness contracts (keyless).
 * Browser replay: `PERSONA_INSTALLED_EXE=…` + {@link ./mandatory-installed-onboarding.spec.ts}.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/paths.ts'

describe('D8 — installed boot scripts (Probe)', () => {
  it('installed-onboarding-cdp.mjs fails loud with screenshot + JSON', () => {
    const path = join(REPO_ROOT, 'scripts/persona/installed-onboarding-cdp.mjs')
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('installed-onboarding-fail.png')
    expect(source).toContain('data-persona-shell')
  })

  it('installed-cdp-diag.mjs writes artifacts/installed-cdp-diag.json', () => {
    const path = join(REPO_ROOT, 'scripts/persona/installed-cdp-diag.mjs')
    const source = readFileSync(path, 'utf8')
    expect(source).toContain('installed-cdp-diag.json')
    expect(existsSync(path)).toBe(true)
  })

  it('reap-orphans.mjs lists vitest trees (Atlas memory policy)', () => {
    const path = join(REPO_ROOT, 'scripts/persona/reap-orphans.mjs')
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('apps[/\\\\]cli[/\\\\]src[/\\\\]bin\\.ts')
  })
})

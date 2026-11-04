/**
 * V1-P0-5 / V1-P0-6 — THE real-engine acceptance: clean profile in the INSTALLED Persona.exe → onboarding → ask → a real
 * model turn on the user's own logged-in CLI → delivery in #geral → accept, in under 2 minutes.
 *
 * It spends the user's quota, so it is double-gated and refuses to run by accident:
 *   - `PERSONA_REAL_E2E=1`               (opt-in, never in CI)
 *   - `PERSONA_REAL_E2E_OK=<who/when>`   (the explicit go-ahead from Atlas, e.g. `atlas-2026-11-04`; Probe never invents it)
 *   - `PERSONA_INSTALLED_EXE=<Persona.exe>`
 * and it refuses when any fake CLI is pinned. Budget: ONE run (the product's target is one paid turn), 120 s hard stop,
 * the whole process tree is killed afterwards (no warm `claude` left behind). No retry loop: a failure is reported, not repeated.
 *
 *   $env:PERSONA_REAL_E2E='1'; $env:PERSONA_REAL_E2E_OK='atlas-AAAA-MM-DD'; $env:PERSONA_INSTALLED_EXE='C:\p8i\Persona.exe'
 *   node scripts/persona/with-lock.mjs "Probe REAL first delivery" -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-first-delivery-real-installed.spec.ts
 *
 * Evidence: `artifacts/first-delivery/real-installed/` (`proof.json` with the timings, screenshots, `electron.log`).
 */
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { watchConsole } from '../src/console-tripwire.ts'
import {
  createFirstDeliveryRecorder,
  expectBootOverlayGone,
  readBootOverlay,
  runHappyFirstDelivery,
  walkOnboardingToStep5,
} from '../src/first-delivery-flow.ts'
import { PACKAGE_ROOT } from '../src/paths.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'

const exe = process.env.PERSONA_INSTALLED_EXE
const FAKE_DIR = join(PACKAGE_ROOT, 'fixtures', 'fake-cli')
const optedIn = process.env.PERSONA_REAL_E2E === '1'
const approval = process.env.PERSONA_REAL_E2E_OK ?? ''
const allowed = optedIn && approval.trim() !== '' && exe !== undefined && exe !== '' && existsSync(exe)
const UX_PHASE_A_MS = 120_000

/** Fakes leaking into a "real" run would make it meaningless (or, worse, look green): refuse. */
function fakeLeaks(): string[] {
  const leaks: string[] = []
  for (const name of ['OAR_CLAUDE_BIN', 'OAR_CODEX_BIN', 'OAR_OPENCODE_BIN']) {
    if ((process.env[name] ?? '').startsWith(FAKE_DIR)) leaks.push(name)
  }
  if ((process.env.PATH ?? '').split(delimiter).some(entry => entry === FAKE_DIR)) leaks.push('PATH')
  if ((process.env.PERSONA_E2E_EXTRA_PATH ?? '') !== '') leaks.push('PERSONA_E2E_EXTRA_PATH')
  return leaks
}

describe('first delivery — REAL engine in the installed exe (opt-in, one run)', () => {
  it.skipIf(allowed)('is gated: needs PERSONA_REAL_E2E=1, PERSONA_REAL_E2E_OK=<authorization> and PERSONA_INSTALLED_EXE', () => {
    expect(allowed).toBe(false)
  })

  it.skipIf(!allowed)('clean profile → ask → real delivery in #geral → accept, within 2 minutes', async () => {
    expect(fakeLeaks(), 'a fake CLI is configured: this must be the real engine').toEqual([])
    const desktop = await startInstalledDesktop({ exe: exe! })
    const { page } = desktop
    const tripwire = watchConsole(page)
    const rec = await createFirstDeliveryRecorder(page, 'real-installed')
    let outcome: Record<string, unknown> = { stage: 'started', authorization: approval }
    try {
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await expectBootOverlayGone(page, rec)
      await walkOnboardingToStep5(page, 'Probe Real', rec.shot, rec.notes)
      rec.mark('step5 visible')
      const result = await runHappyFirstDelivery(page, rec, { fakeTurnMs: 0, deadlineMs: UX_PHASE_A_MS })
      await rec.shot('08-after-accept')
      // The delivered text is whatever the real model said: it must be a real message in #geral, not an error card.
      const body = await page.locator('body').innerText()
      expect(body, 'an error card showed instead of a delivery').not.toMatch(/Não conseguimos|não está disponível|Tentar de novo/u)
      outcome = { stage: 'passed', authorization: approval, ...result }
      expect(result.askToCelebrateMs, 'ask → celebrate must fit 2 min').toBeLessThan(UX_PHASE_A_MS)
      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      outcome = { stage: 'FAILED', authorization: approval, error: error instanceof Error ? error.message.slice(0, 600) : String(error) }
      await rec.shot('zz-failed')
      throw error
    } finally {
      await rec.write({
        exe, home: desktop.home, outcome,
        bootOverlay: await readBootOverlay(page).catch(() => 'unreadable'),
        consoleErrors: tripwire.consoleErrors.slice(0, 20),
        pageErrors: tripwire.pageErrors.slice(0, 20),
      })
      await writeFile(join(rec.dir, 'electron.log'), desktop.log().slice(-60_000)).catch(() => {})
      await desktop.stop() // kills the whole tree: no warm real CLI session may survive the run
    }
  }, UX_PHASE_A_MS + 300_000)
})

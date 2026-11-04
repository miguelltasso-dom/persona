/**
 * D8 Tier 2 — full Persona onboarding on installed Persona.exe (CDP).
 * Set PERSONA_INSTALLED_EXE or skip; one-shot script: scripts/persona/installed-onboarding-cdp.mjs
 */
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { startInstalledDesktop } from '../src/installed-desktop.ts'
import {
  assertConsoleClean,
  assertNotHarnessShell,
  completeOnboardingOverlay,
  chat,
} from '../src/real-app-session.ts'
import { watchConsole } from '../src/console-tripwire.ts'

const exe = process.env.PERSONA_INSTALLED_EXE
const run = exe !== undefined && exe !== '' && existsSync(exe)

describe.skipIf(!run)('mandatory installed onboarding (D8, CDP)', () => {
  it('walks Persona overlay steps 1–5 on clean homes (DSH Welcome skipped by installed-cdp env)', async () => {
    const desktop = await startInstalledDesktop({ exe: exe! })
    try {
      const tripwire = watchConsole(desktop.page)
      await desktop.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
      await completeOnboardingOverlay(desktop.page)
      await assertNotHarnessShell(desktop.page)
      await desktop.page.getByPlaceholder(chat.composerPlaceholder).waitFor({ state: 'visible', timeout: 60_000 })
      assertConsoleClean(tripwire)
      expect(desktop.home).toContain('e2e-installed')
    } finally {
      await desktop.stop()
    }
  }, 600_000)
})

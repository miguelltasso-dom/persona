#!/usr/bin/env node
/**
 * D8 — onboarding Persona on an installed/unpacked Persona.exe via CDP (Probe).
 *
 * Usage:
 *   node --import tsx/esm scripts/persona/installed-onboarding-cdp.mjs "C:/path/to/Persona.exe"
 *
 * Env:
 *   PERSONA_INSTALLED_EXE — same as argv[2]
 *   PERSONA_E2E_KEEP_HOME=1 — retain disposable PERSONA_HOME after run
 */
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startInstalledDesktop } from '../../packages/persona/persona-e2e/src/installed-desktop.ts'
import {
  assertConsoleClean,
  assertNotHarnessShell,
  completeOnboardingOverlay,
  chat,
} from '../../packages/persona/persona-e2e/src/real-app-session.ts'
import { watchConsole } from '../../packages/persona/persona-e2e/src/console-tripwire.ts'
import { osScreenshot } from '../../packages/persona/persona-e2e/src/desktop-host.ts'
import { ARTIFACTS_DIR } from '../../packages/persona/persona-e2e/src/paths.ts'
import { onboarding } from '../../packages/persona/persona-e2e/src/real-app-locale.pt.ts'

const exe = process.env.PERSONA_INSTALLED_EXE ?? process.argv[2]
if (exe === undefined || exe === '') {
  process.stderr.write('Usage: installed-onboarding-cdp.mjs <Persona.exe>\n')
  process.exit(2)
}
if (!existsSync(exe)) {
  process.stderr.write(`Persona.exe not found: ${exe}\n`)
  process.exit(2)
}

await mkdir(ARTIFACTS_DIR, { recursive: true })

const desktop = await startInstalledDesktop({
  exe,
  keepRunRoot: process.env.PERSONA_E2E_KEEP_HOME === '1',
})

const failShot = join(ARTIFACTS_DIR, 'installed-onboarding-fail.png')
try {
  const tripwire = watchConsole(desktop.page)
  await desktop.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })

  const step1 = desktop.page.getByRole('heading', { name: onboarding.step1Title })
  const welcomeSkipped = await step1.count() === 0
  if (welcomeSkipped) {
    process.stdout.write('[probe] DSH welcome skipped (expected); checking Persona onboarding overlay…\n')
  }

  await completeOnboardingOverlay(desktop.page)

  await assertNotHarnessShell(desktop.page)
  await desktop.page.getByPlaceholder(chat.composerPlaceholder).waitFor({ state: 'visible', timeout: 60_000 })

  const rendererPath = join(ARTIFACTS_DIR, 'installed-onboarding-renderer.png')
  await desktop.page.screenshot({ path: rendererPath, animations: 'disabled' })
  const osPath = join(ARTIFACTS_DIR, 'installed-onboarding-os.png')
  await osScreenshot(osPath)

  assertConsoleClean(tripwire)

  process.stdout.write(JSON.stringify({
    ok: true,
    exe: desktop.exe,
    home: desktop.home,
    userData: desktop.userData,
    rendererPort: desktop.rendererPort,
    screenshots: { renderer: rendererPath, os: osPath },
    note: 'DSH_DESKTOP_WELCOME=0 (installed-cdp); Persona steps 1–5 exercised via completeOnboardingOverlay',
  }, null, 2))
  process.stdout.write('\n')
} catch (error) {
  await desktop.page.screenshot({ path: failShot, animations: 'disabled' }).catch(() => {})
  const shell = await desktop.page.locator('[data-persona-shell]').count().catch(() => -1)
  const rootHtml = await desktop.page.locator('#root').innerHTML().catch(() => '')
  process.stderr.write(JSON.stringify({
    ok: false,
    exe: desktop.exe,
    home: desktop.home,
    error: error instanceof Error ? error.message : String(error),
    shell,
    rootEmpty: rootHtml.trim().length === 0,
    screenshot: failShot,
  }, null, 2))
  process.stderr.write('\n')
  process.exit(1)
} finally {
  await desktop.stop()
}

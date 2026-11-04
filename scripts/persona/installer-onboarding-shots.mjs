#!/usr/bin/env node
/**
 * D8 — install-dir Persona.exe: splash / onboarding step 1 / #geral shots.
 *
 *   node --import tsx/esm scripts/persona/installer-onboarding-shots.mjs "C:/p8i/Persona.exe"
 */
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { startInstalledDesktop } from '../../packages/persona/persona-e2e/src/installed-desktop.ts'
import {
  completeOnboardingOverlay,
  chat,
} from '../../packages/persona/persona-e2e/src/real-app-session.ts'
import { osScreenshot } from '../../packages/persona/persona-e2e/src/desktop-host.ts'
import { onboarding } from '../../packages/persona/persona-e2e/src/real-app-locale.pt.ts'
import { REPO_ROOT } from '../../packages/persona/persona-e2e/src/paths.ts'

const exe = process.env.PERSONA_INSTALLED_EXE ?? process.argv[2]
if (exe === undefined || exe === '') {
  process.stderr.write('Usage: installer-onboarding-shots.mjs <Persona.exe>\n')
  process.exit(2)
}
if (!existsSync(exe)) {
  process.stderr.write(`Persona.exe not found: ${exe}\n`)
  process.exit(2)
}

const outDir = join(REPO_ROOT, '.maestri', 'tmp', 'shots', 'installer')
await mkdir(outDir, { recursive: true })

const desktop = await startInstalledDesktop({
  exe,
  keepRunRoot: process.env.PERSONA_E2E_KEEP_HOME === '1',
})

const shot = async (name) => {
  const renderer = join(outDir, `${name}.png`)
  const os = join(outDir, `${name}-os.png`)
  await desktop.page.screenshot({ path: renderer, animations: 'disabled' }).catch(() => {})
  await osScreenshot(os).catch(() => {})
  return { renderer, os }
}

try {
  await shot('splash')
  await desktop.page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  const step1 = desktop.page.getByRole('heading', { name: onboarding.step1Title })
  await step1.waitFor({ state: 'visible', timeout: 60_000 })
  const onboarding1 = await shot('onboarding-passo-1')
  await completeOnboardingOverlay(desktop.page)
  await desktop.page.getByPlaceholder(chat.composerPlaceholder).waitFor({ state: 'visible', timeout: 60_000 })
  const geral = await shot('geral')
  process.stdout.write(`${JSON.stringify({
    ok: true,
    exe: desktop.exe,
    home: desktop.home,
    shots: { onboarding1, geral, dir: outDir },
  }, null, 2)}\n`)
} finally {
  await desktop.stop()
}

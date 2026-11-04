#!/usr/bin/env node
/** Dump installed Persona.exe CDP pages after attach (D8 diagnose). */
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { startInstalledDesktop } from '../../packages/persona/persona-e2e/src/installed-desktop.ts'
import { ARTIFACTS_DIR } from '../../packages/persona/persona-e2e/src/paths.ts'

const exe = process.env.PERSONA_INSTALLED_EXE ?? process.argv[2]
if (!exe) {
  process.stderr.write('Usage: installed-cdp-diag.mjs <Persona.exe>\n')
  process.exit(2)
}

await mkdir(ARTIFACTS_DIR, { recursive: true })
const desktop = await startInstalledDesktop({ exe, keepRunRoot: true })
const waitMs = Number(process.env.PERSONA_DIAG_WAIT_MS ?? '45000')
const consoleLines = []
desktop.page.on('console', (msg) => {
  consoleLines.push(`${msg.type()}: ${msg.text()}`)
})
desktop.page.on('pageerror', (error) => {
  consoleLines.push(`pageerror: ${error.message}`)
})
try {
  await new Promise((done) => { setTimeout(done, waitMs) })
  const pages = []
  for (const context of desktop.page.context().browser()?.contexts() ?? []) {
    for (const candidate of context.pages()) {
      const html = await candidate.content().catch(() => '')
      pages.push({
        url: candidate.url(),
        title: await candidate.title().catch(() => ''),
        htmlHead: html.slice(0, 2500),
        shell: await candidate.locator('[data-persona-shell]').count().catch(() => -1),
        bodyText: await candidate.locator('body').innerText().catch(() => '').then((t) => t.slice(0, 800)),
      })
    }
  }
  const shot = join(ARTIFACTS_DIR, 'installed-cdp-diag.png')
  await desktop.page.screenshot({ path: shot, animations: 'disabled' }).catch(() => {})
  const report = {
    exe: desktop.exe,
    home: desktop.home,
    userData: desktop.userData,
    rendererPort: desktop.rendererPort,
    pageUrl: desktop.page.url(),
    shot,
    consoleLines: consoleLines.slice(0, 80),
    pages,
  }
  const jsonPath = join(ARTIFACTS_DIR, 'installed-cdp-diag.json')
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} finally {
  await desktop.stop()
}

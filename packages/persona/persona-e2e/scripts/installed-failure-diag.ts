/**
 * Diagnostic for the INSTALLED exe with the CLEAN environment: ask for the first delivery with the fake CLI on PATH and, when the app says
 * "O motor … não está disponível", dump what the host stored (events/tickets mentioning the engine) and what the stub saw. Spends nothing.
 *
 *   $env:PERSONA_INSTALLED_EXE='C:\p8i\Persona.exe'; node --import tsx/esm packages/persona/persona-e2e/scripts/installed-failure-diag.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { withFakeCliOnPath } from '../src/fake-cli.ts'
import { createFirstDeliveryRecorder, expectBootOverlayGone, firstDeliveryCopy, walkOnboardingToStep5 } from '../src/first-delivery-flow.ts'
import { startInstalledDesktop } from '../src/installed-desktop.ts'
import { copyFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { onboarding } from '../src/real-app-locale.pt.ts'

const exe = process.env.PERSONA_INSTALLED_EXE ?? 'C:\p8i\Persona.exe'
const scope = withFakeCliOnPath({ turnMs: 1500, reply: 'diag' })
const desktop = await startInstalledDesktop({ exe, keepRunRoot: true })
const { page } = desktop
try {
  const rec = await createFirstDeliveryRecorder(page, 'diag-failure')
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  await expectBootOverlayGone(page, rec)
  await walkOnboardingToStep5(page, 'Probe Diag', rec.shot, rec.notes)
  await page.getByRole('button', { name: onboarding.requestNow, exact: true }).click()
  const celebrate = page.getByText(firstDeliveryCopy.celebrateTitle)
  const failed = page.getByText(/não está disponível neste computador/u)
  await celebrate.or(failed).first().waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {})
  console.log('celebrated:', await celebrate.isVisible().catch(() => false), '| failed:', await failed.isVisible().catch(() => false))
  console.log('body:', (await page.locator('body').innerText()).replace(/\s+/gu, ' ').slice(0, 500))
  const calls = scope.invocations()
  console.log('stub invocations', calls.length, 'turns', calls.filter(call => call.event === 'turn').length)
  console.log('stub non-invoke events:', JSON.stringify(calls.filter(call => call.event !== 'invoke')).slice(0, 1800))
  console.log('stub argv tail:', calls.slice(-6).map(call => `${call.tool} ${call.argv.join(' ')} [${call.event}]`))
} finally {
  const home = desktop.home
  console.log('--- exe stdout/stderr (tail)')
  console.log(desktop.log().slice(-4000))
  await desktop.stop()
  scope.restore()
  console.log('HOME', home)
  const file = join(home, 'db', 'persona.db')
  if (existsSync(file)) {
    const scratch = mkdtempSync(join(tmpdir(), 'diag-db-'))
    copyFileSync(file, join(scratch, 'p.db'))
    for (const suffix of ['-wal', '-shm']) if (existsSync(file + suffix)) copyFileSync(file + suffix, join(scratch, 'p.db' + suffix))
    const db = new DatabaseSync(join(scratch, 'p.db'))
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name)
    console.log('tables', tables.join(','))
    for (const table of tables.filter(name => /event|message|ticket|assign|error/u.test(name))) {
      const rows = (db.prepare(`SELECT * FROM ${table} LIMIT 400`).all() as Array<Record<string, unknown>>).slice(-40)
      for (const row of rows) {
        const text = JSON.stringify(row)
        if (/motor|engine|fail|unavail|erro|error/iu.test(text)) console.log(`[${table}]`, text.slice(0, 600))
      }
    }
    db.close()
  }
  // Every log-like file the app wrote (host log, crash reports, Electron logs), newest content last.
  const walk = (dir: string, depth = 0): string[] => {
    if (depth > 5 || !existsSync(dir)) return []
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name)
      try { return statSync(full).isDirectory() ? walk(full, depth + 1) : [full] } catch { return [] }
    })
  }
  const roots = [home, join(home, '..', 'user-data')]
  for (const root of roots) {
    for (const file of walk(root).filter(name => /(.log|.txt|crash|.jsonl)$/iu.test(name) && !/persona.db/u.test(name))) {
      console.log(`--- ${file} (${String(statSync(file).size)} bytes)
${readFileSync(file, 'utf8').slice(-2500)}`)
    }
  }
}

/**
 * ENG-1 diagnostic on the CURRENT TREE (Forge, 04/11 21:54): boot the dev Electron (`pnpm start:desktop`) with the CLEAN environment and the fake
 * CLI on PATH, ask for the first delivery and read what the host stored in `screen_doc` kind 'run_failure' ({at, detail, stack}) when the run
 * is refused. Spends nothing (fake CLI).
 *
 *   node --import tsx/esm packages/persona/persona-e2e/scripts/dev-desktop-failure-diag.ts
 */
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { startDesktop } from '../src/desktop-host.ts'
import { withFakeCliOnPath } from '../src/fake-cli.ts'
import { createFirstDeliveryRecorder, expectBootOverlayGone, firstDeliveryCopy, walkOnboardingToStep5 } from '../src/first-delivery-flow.ts'
import { onboarding } from '../src/real-app-locale.pt.ts'

const scope = withFakeCliOnPath({ turnMs: 1500, reply: 'diag' })
const desktop = await startDesktop({ cleanEnv: true })
const { page } = desktop
try {
  const rec = await createFirstDeliveryRecorder(page, 'diag-dev-desktop')
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  await expectBootOverlayGone(page, rec)
  await walkOnboardingToStep5(page, 'Probe Dev', rec.shot, rec.notes)
  await page.getByRole('button', { name: onboarding.requestNow, exact: true }).click()
  const celebrate = page.getByText(firstDeliveryCopy.celebrateTitle)
  const failed = page.getByText(/não está disponível neste computador/u)
  await celebrate.or(failed).first().waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {})
  console.log('celebrated:', await celebrate.isVisible().catch(() => false), '| failed:', await failed.isVisible().catch(() => false))
  const calls = scope.invocations()
  console.log('stub invocations', calls.length, 'turns', calls.filter(call => call.event === 'turn').length)
  console.log('stub non-invoke events:', JSON.stringify(calls.filter(call => call.event !== 'invoke')).slice(0, 1500))
  console.log('body:', (await page.locator('body').innerText()).replace(/s+/gu, ' ').slice(0, 700))
} finally {
  const home = desktop.home
  await desktop.stop()
  scope.restore()
  console.log('HOME', home)
  const file = join(home, 'db', 'persona.db')
  if (existsSync(file)) {
    const scratch = mkdtempSync(join(tmpdir(), 'diag-dev-db-'))
    copyFileSync(file, join(scratch, 'p.db'))
    for (const suffix of ['-wal', '-shm']) if (existsSync(file + suffix)) copyFileSync(file + suffix, join(scratch, 'p.db' + suffix))
    const db = new DatabaseSync(join(scratch, 'p.db'))
    try {
      const rows = db.prepare("SELECT * FROM screen_doc WHERE kind = 'run_failure'").all() as Array<Record<string, unknown>>
      console.log('run_failure rows:', rows.length)
      for (const table of ['engine_ticket', 'event']) {
        const all = db.prepare(`SELECT * FROM ${table} LIMIT 400`).all() as Array<Record<string, unknown>>
        for (const row of all.slice(-8)) console.log(`[${table}]`, JSON.stringify(row).slice(0, 500))
      }
      for (const row of rows) console.log(JSON.stringify(row).slice(0, 3500))
    } catch (error) {
      console.log('no screen_doc table / query failed:', error instanceof Error ? error.message : String(error))
    }
    db.close()
  }
}

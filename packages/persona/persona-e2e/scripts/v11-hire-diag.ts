/**
 * Bundle 3 made the v1.1 client flags ON by default (`flags.ts`, navPlaces included): the OLD rail with "Contratar persona" is gone unless the flag is '0'. This read-only
 * diagnostic opens the app the way a user gets it (no flag set), WITHOUT hiring, and records how a person can reach the team assistant from the new bar — so the E2E
 * helper (and Keel) know whether "hire a team after onboarding" still has a visible path. 0 AI, fake CLI.
 *
 *   node scripts/persona/with-lock.mjs "Probe hire diag" --lock build --wait-max 1200000 -- node --import tsx/esm packages/persona/persona-e2e/scripts/v11-hire-diag.ts
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { ARTIFACTS_DIR } from '../src/paths.ts'
import { openV11Session } from '../src/v11-app.ts'

const OUT = join(ARTIFACTS_DIR, 'v11-hire-diag')
await mkdir(OUT, { recursive: true })
const notes: string[] = []
const note = (line: string): void => { notes.push(line); console.log(line) }

async function visible(page: Page, label: string): Promise<void> {
  const seen = await page.evaluate(() => ({
    headings: [...document.querySelectorAll('h1,h2,h3')].map(element => (element.textContent ?? '').trim().slice(0, 60)).slice(0, 10),
    buttons: [...document.querySelectorAll('button')].map(element => (element.getAttribute('aria-label') ?? element.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 60),
    places: [...document.querySelectorAll('[data-nav-place]')].map(element => element.getAttribute('data-nav-place')),
    flags: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('persona.flag')).map(key => [key, localStorage.getItem(key)])),
  })).catch(() => ({}))
  note(`## ${label}\n${JSON.stringify(seen)}`)
}

const v11 = await openV11Session({ hireTeam: false })
const { page } = v11
try {
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: join(OUT, '01-default.png') })
  await visible(page, 'default shell (no flag set)')

  note('# path A — the "Equipe" place')
  await page.locator('[data-nav-place="team"]').first().click().catch(error => note(`team place not clickable: ${String(error).slice(0, 120)}`))
  await page.waitForTimeout(1_200)
  await page.screenshot({ path: join(OUT, '02-team-place.png') })
  await visible(page, 'after clicking the team place')

  note('# path B — Ctrl+K "Contratar"')
  await page.keyboard.press('Control+K')
  await page.waitForTimeout(500)
  await page.keyboard.type('Contratar')
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(OUT, '03-ctrlk.png') })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: join(OUT, '04-after-hire-action.png') })
  await visible(page, 'after Ctrl+K → Contratar → Enter')
} finally {
  await writeFile(join(OUT, 'notes.md'), notes.join('\n'))
  await v11.close()
}

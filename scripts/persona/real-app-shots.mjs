// Real Persona profile walkthrough + screenshots (B9). Run under lock:
// node scripts/persona/with-lock.mjs "Lumen real shots" -- node scripts/persona/real-app-shots.mjs
import { spawn, execFileSync } from 'node:child_process'
import { freePort } from './free-port.mjs'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { completePersonaOnboardingOverlay } from './playwright-onboarding.mjs'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const devSeed = process.env.PERSONA_DEV_SEED === '1'
const home = `${root}/.maestri/tmp/real-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/real`
mkdirSync(home, { recursive: true })
mkdirSync(outDir, { recursive: true })
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser

/** Lumen panels (labels match persona-e2e real-gallery/panels.ts). */
const LUMEN_PANELS = [
  { id: 'kanban', labels: ['Kanban'], ready: '[data-persona-kanban="global"]' },
  { id: 'knowledge', labels: ['Conhecimento', 'Knowledge'], ready: '[data-persona-surface="knowledge"]' },
  { id: 'routines', labels: ['Rotinas', 'Routines'], ready: '[data-persona-surface="routines"]' },
  { id: 'files', labels: ['Arquivos', 'Files'], ready: '[data-persona-surface="files"]' },
  { id: 'usage', labels: ['Uso e limites', 'Usage and limits'], ready: '[data-persona-surface="usage"]' },
  { id: 'connections', labels: ['Conexões', 'Connections'], ready: '[data-persona-surface="connections"]' },
  { id: 'approvals', labels: ['Aprovações', 'Approvals'], ready: '[data-persona-surface="approvals"]' },
  { id: 'rules', labels: ['Regras', 'Rules'], ready: '[data-persona-surface="rules"]' },
  { id: 'profile', labels: ['Perfil', 'Profile'], ready: '[data-persona-surface="profile"]', more: true },
  { id: 'members', labels: ['Membros', 'Members'], ready: '[data-persona-surface="members"]', more: true },
  { id: 'importers', labels: ['Importadores', 'Importers'], ready: '[data-persona-surface="importers"]', more: true },
  { id: 'canvas', labels: ['Canvas'], ready: '[data-persona-surface="canvas"]', more: true },
]

async function ensureMoreOpen(page) {
  const mais = page.getByRole('button', { name: /^Mais$|^More$/u })
  if (!(await mais.count())) return
  const expanded = await mais.first().getAttribute('aria-expanded')
  if (expanded === 'false') await mais.first().click()
}

async function clickNavLabel(page, labels) {
  for (const label of labels) {
    const btn = page.getByRole('button', { name: label, exact: true })
    if (await btn.count()) {
      await btn.first().scrollIntoViewIfNeeded()
      await btn.first().click({ timeout: 20_000 })
      return true
    }
  }
  return false
}

const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 240_000)
const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, locale: 'pt-BR' })
      await context.addInitScript((seed) => {
        if (!seed) localStorage.setItem('persona.onboarding.complete.v1', '1')
        else localStorage.setItem('persona.devSeed.v1', '1')
      }, devSeed)
      const page = await context.newPage()
      await page.goto(match[1], { waitUntil: 'load' })
      await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {})
      if (!devSeed) {
        const onBoard = await page.getByText(/Passo 1 de 5|Step 1 of 5/u).isVisible().catch(() => false)
        if (onBoard) {
          await page.screenshot({ path: `${outDir}/persona-${scheme}-onboarding.png` })
          await completePersonaOnboardingOverlay(page)
        }
      }
      await page.waitForTimeout(3000)
      await page.screenshot({ path: `${outDir}/persona-${scheme}-shell.png` })
      await page.screenshot({ path: `${outDir}/persona-${scheme}-channel.png` })
      if (scheme === 'light') {
        for (const panel of LUMEN_PANELS) {
          if (panel.more) await ensureMoreOpen(page)
          const clicked = await clickNavLabel(page, panel.labels)
          if (!clicked) {
            console.warn(`skip ${panel.id}: nav missing (${panel.labels.join(' / ')})`)
            continue
          }
          if (panel.ready !== undefined) {
            await page.locator(panel.ready).first().waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {})
          } else {
            await page.waitForTimeout(4000)
          }
          await page.screenshot({ path: `${outDir}/${panel.id}.png`, fullPage: true })
          console.log(`captured ${panel.id}.png`)
        }
      }
      await context.close()
    }
    await finish(0, `shots: ${outDir}`)
  } catch (error) {
    await finish(1, `failed: ${error instanceof Error ? error.message : String(error)}\n${out.slice(-800)}`)
  }
}
child.stdout.on('data', onData); child.stderr.on('data', onData)
child.on('exit', (code) => { clearTimeout(timer); console.log(`host exited early ${code}\n${out.slice(-1200)}`); process.exit(1) })

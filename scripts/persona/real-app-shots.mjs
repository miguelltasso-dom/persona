// Real Persona profile walkthrough + screenshots (B9). Run under lock:
// node scripts/persona/with-lock.mjs "Prism real shots" -- node scripts/persona/real-app-shots.mjs
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/real-shot-home`
const outDir = `${root}/.maestri/tmp/shots/real`
mkdirSync(home, { recursive: true })
mkdirSync(outDir, { recursive: true })
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 180_000)
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
      const page = await context.newPage()
      await page.goto(match[1], { waitUntil: 'load' })
      await page.waitForTimeout(8000)
      const hasOnboarding = await page.getByText(/Passo 1 de 5|Step 1 of 5/u).isVisible().catch(() => false)
      if (hasOnboarding) {
        await page.screenshot({ path: `${outDir}/persona-${scheme}-onboarding.png` })
        await page.locator('input').first().fill('Miguel')
        await page.getByRole('button', { name: 'Continuar', exact: true }).click()
        await page.waitForTimeout(500)
        await page.locator('textarea').first().fill('Tom de voz: claro e humano.')
        await page.getByRole('button', { name: 'Continuar', exact: true }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: 'Continuar sem conectar', exact: true }).click()
        await page.waitForTimeout(500)
        await page.getByRole('button', { name: 'Continuar', exact: true }).click()
        await page.waitForTimeout(500)
        const finish = page.getByRole('button', { name: /Entrar no Persona|Enter Persona|Concluir|Finish/u })
        await finish.first().click({ timeout: 15_000 })
        await page.waitForTimeout(6000)
      }
      const overlayOpen = await page.getByText(/Passo [1-5] de 5|Step [1-5] of 5/u).isVisible().catch(() => false)
      if (overlayOpen) {
        console.warn('onboarding still open; panel shots may show scrim')
      }
      await page.screenshot({ path: `${outDir}/persona-${scheme}-shell.png` })
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${outDir}/persona-${scheme}-channel.png` })
      if (scheme === 'light') {
        const lumenPanels = [
          ['kanban', ['Kanban']],
          ['knowledge', ['Conhecimento', 'Knowledge']],
          ['routines', ['Rotinas', 'Routines']],
          ['files', ['Arquivos', 'Files']],
          ['usage', ['Uso e limites', 'Usage and limits']],
          ['connections', ['Conexões', 'Connections']],
          ['approvals', ['Aprovações', 'Approvals']],
          ['rules', ['Regras', 'Rules']],
          ['profile', ['Perfil', 'Profile']],
          ['members', ['Membros', 'Members']],
          ['importers', ['Importadores', 'Importers']],
          ['canvas', ['Canvas']],
        ]
        const sidebar = page.getByRole('navigation', { name: /Persona/i })
        for (const [id, labels] of lumenPanels) {
          let nav = sidebar.getByRole('button', { name: labels[0], exact: true })
          if (!(await nav.count()) && labels[1] !== undefined) {
            nav = sidebar.getByRole('button', { name: labels[1], exact: true })
          }
          if (!(await nav.count())) {
            console.warn(`skip ${id}: nav missing (${labels.join(' / ')})`)
            continue
          }
          await nav.first().scrollIntoViewIfNeeded()
          await nav.first().click({ timeout: 15_000 })
          await page.waitForTimeout(5500)
          await page.screenshot({ path: `${outDir}/${id}.png`, fullPage: true })
          console.log(`captured ${id}.png`)
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

// COLHEITA 5 (Prism): capturas do "Segure para enviar" para o aceite da Muse, no shell real (Aprovações, cartões de exemplo do dev seed).
// Run: node scripts/persona/with-lock.mjs "Prism colheita5 shots" -- node scripts/persona/prism-colheita-shots.mjs
// Saída: .maestri/tmp/shots/design/colheita-5/<estado>-<claro|escuro>-<100|200>.png  (+ quadro do meio do enchimento e da dica)
// O que cada estado prova: normal (selo "Vale até"), soon ("Vence em N min", âmbar), apagar (variante perigo), vencido ("Pedir de novo"),
// hold-meio (o enchimento a ~40%: scaleX real lido do ::before), dica (clique curto), cheio (completou: "Enviando…" + check).
import { spawn, execFileSync } from 'node:child_process'
import { freePort } from './free-port.mjs'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/prism-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/design/colheita-5`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const errors = []
const notes = []
const finish = async (code, note) => {
  console.log(note)
  for (const line of notes) console.log(line)
  if (errors.length > 0) console.log(`console errors (${errors.length}):\n${errors.slice(0, 8).join('\n')}`)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 420_000)

const ONLY = process.env.PRISM_ZOOM // "100" | "200": run one zoom only
const ZOOMS = [
  { name: '100', viewport: { width: 1440, height: 900 }, scale: 1 },
  { name: '960', viewport: { width: 960, height: 640 }, scale: 1 },
  { name: '200', viewport: { width: 720, height: 450 }, scale: 2 },
].filter(zoom => ONLY === undefined || ONLY.split(',').includes(zoom.name))
const SCHEMES = [{ name: 'claro', scheme: 'light' }, { name: 'escuro', scheme: 'dark' }]

async function open(url, { scheme }, zoom) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: zoom.viewport, deviceScaleFactor: zoom.scale, colorScheme: scheme, locale: 'pt-BR' })
  await context.addInitScript((dark) => {
    localStorage.setItem('persona.rail.collapsed.v1', '0')
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.setItem('persona.devSeed.v1', '1')
    localStorage.setItem('persona.devSeed.connector', '1')
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, scheme === 'dark')
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${scheme}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme}] pageerror ${String(e).slice(0, 240)}`))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(9000)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(6000)
  return { context, page }
}

async function openApprovals(page) {
  const byId = page.locator('[data-nav-panel="approvals"], [data-tab-panel="approvals"]').first()
  await byId.evaluate((node) => { node.scrollIntoView({ block: 'center' }) })
  await byId.click({ timeout: 15_000 })
  await page.locator('[role="option"]').first().waitFor({ timeout: 25_000 })
  await page.locator('[data-persona-surface="approvals"][aria-busy="true"]').waitFor({ state: 'detached', timeout: 25_000 }).catch(() => undefined)
  await page.waitForTimeout(800)
}

/**
 * Select the row whose detail matches, by what the card says (the order of the inbox is not the order of the sample). In the narrow layout (200%)
 * the detail replaces the list: it opens on a row and "Voltar à lista" brings the list back.
 */
async function selectCard(page, matcher) {
  const rows = () => page.locator('[role="option"]:visible')
  const toList = async () => {
    // Narrow layout: while the detail is open the list pane is hidden (its rows exist but are not visible).
    if (await rows().count() === 0) {
      await page.getByRole('button', { name: 'Voltar à lista' }).first().click({ timeout: 5000 }).catch(() => undefined)
      await page.waitForTimeout(400)
    }
  }
  await toList()
  const count = await rows().count()
  for (let index = 0; index < count; index += 1) {
    await toList()
    await rows().nth(index).click({ timeout: 5000 }).catch(() => undefined)
    await page.waitForTimeout(450)
    const detail = page.locator('[data-persona-approval-detail]').first()
    const visible = await detail.isVisible().catch(() => false)
    const text = visible ? await detail.innerText().catch(() => '') : ''
    if (visible && matcher(text)) return true
  }
  return false
}

async function shot(target, name) {
  const path = `${outDir}/${name}.png`
  await target.screenshot({ path })
  if (statSync(path).size < 5_000) throw new Error(`blank capture ${name}`)
  return path
}

const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const saved = []
    for (const zoom of ZOOMS) {
      for (const scheme of SCHEMES) {
        const tag = `${scheme.name}-${zoom.name}`
        const { context, page } = await open(match[1], scheme, zoom)
        try {
          await openApprovals(page)
          const detail = () => page.locator('[data-persona-approval-detail]').first()
          // Todas as imagens decodificadas antes de fotografar (a ilustração do painel saía vazia no claro a 960).
          await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => undefined))))
          await page.waitForTimeout(500)
          saved.push(await shot(page, `pagina-${tag}`))
          // Fora do 100% o quadro é o da janela toda, com o painel de detalhe rolado ao topo (o recorte do elemento deixava uma faixa em branco sobre o cabeçalho).
          const stateFrame = async () => {
            if (zoom.name === '100') return detail()
            await detail().evaluate((node) => { node.scrollTop = 0; node.scrollIntoView({ block: 'start' }) })
            await page.waitForTimeout(250)
            return page
          }
          const states = [
            ['normal', text => /Vale até/u.test(text) && /Segure para enviar/u.test(text)],
            ['soon', text => /Vence em \d+ min/u.test(text)],
            ['apagar', text => /Segure para apagar/u.test(text)],
            ['vencido', text => /Passou do prazo/u.test(text)],
          ]
          for (const [state, matcher] of states) {
            if (await selectCard(page, matcher)) saved.push(await shot(await stateFrame(), `${state}-${tag}`))
            else notes.push(`[${tag}] estado não encontrado: ${state}`)
          }
          // O movimento (1 viewport por tema basta; a 200% só o quadro do meio): enchimento a ~40%, dica, cheio.
          if (await selectCard(page, text => /Vale até/u.test(text) && /Segure para enviar/u.test(text))) {
            const button = detail().locator('[data-hold-approve]').first()
            // Sobre o botão, relendo a posição a cada gesto (a rolagem e a dica mexem no layout); a 200% o quadro é o da janela toda.
            const over = async () => {
              await button.scrollIntoViewIfNeeded()
              await page.waitForTimeout(150)
              const box = await button.boundingBox()
              if (box === null) throw new Error('botão fora da tela')
              await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
            }
            const frame = zoom.name === '100' ? detail() : page
            await over()
            await page.mouse.down()
            await page.waitForTimeout(480)
            notes.push(`[${tag}] hold-meio: data-phase=${await button.getAttribute('data-phase')} ::before transform=${await button.evaluate(node => getComputedStyle(node, '::before').transform)}`)
            saved.push(await shot(frame, `hold-meio-${tag}`))
            await page.waitForTimeout(560)
            notes.push(`[${tag}] quase cheio: ::before transform=${await button.evaluate(node => getComputedStyle(node, '::before').transform)}`)
            saved.push(await shot(frame, `hold-quase-cheio-${tag}`))
            await page.mouse.up()
            await page.waitForTimeout(250)
            notes.push(`[${tag}] soltou antes de completar: data-phase=${await button.getAttribute('data-phase')} ::before transform=${await button.evaluate(node => getComputedStyle(node, '::before').transform)}`)
            // Clique curto: a dica.
            await over()
            await page.mouse.down(); await page.mouse.up()
            await page.waitForTimeout(300)
            notes.push(`[${tag}] dica visível: ${await detail().locator('[data-hold-hint]').count() > 0}`)
            saved.push(await shot(frame, `dica-${tag}`))
          }
        } catch (error) {
          notes.push(`[${tag}] FALHOU: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`)
          await page.screenshot({ path: `${outDir}/debug-${tag}.png` }).catch(() => undefined)
        }
        await context.close()
      }
    }
    await finish(0, `${saved.length} capturas em ${outDir}`)
  } catch (error) {
    await finish(1, `erro: ${error instanceof Error ? error.stack : String(error)}`)
  }
}
child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('exit', (code) => { if (!browser) finish(1, `host saiu (${String(code)})\n${out.slice(-800)}`) })

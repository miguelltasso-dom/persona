// Lumen: 960x640 and zoom-200% captures (+ horizontal overflow probe) of the secondary screens.
// Boots `--profile persona` on a temp home, opens the real web UI in Chrome (dev seed) and walks the panels.
// Run under the build lock:
//   node scripts/persona/with-lock.mjs "Lumen viewport shots" -- node scripts/persona/lumen-viewport-shots.mjs <phase> [panel label...]
// <phase> = before | after (output dir .maestri/tmp/shots/lumen-viewport/<phase>/). Env LUMEN_REDUCED=1 → reduced motion.
// Viewports: 960x640 (window minimum) and zoom200 (1280x720 window at 200% zoom = 640x360 CSS px, DPR 2).
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { freePort } from './free-port.mjs'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const phase = process.argv[2] ?? 'after'
// D-067: temp home per process and a free port — several app launches can share the machine.
const home = `${root}/.maestri/tmp/lumen-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/lumen-viewport/${phase}`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })

const ALL_PANELS = [
  'Visão geral', 'Quadros', 'Rotinas', 'Conhecimento', 'Segundo cérebro', 'Arquivos', 'Uso e limites', 'Conexões',
  'Aprovações', 'Regras', 'Quem cuida de quem', 'Saúde', 'Membros', 'Importadores', 'Canvas', 'Quadros › projeto',
]
const panels = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ALL_PANELS
const VIEWPORTS = [
  ...(process.env.LUMEN_1440 === '1' ? [{ tag: '1440x900', width: 1440, height: 900, dpr: 1 }] : []),
  { tag: '960x640', width: 960, height: 640, dpr: 1 },
  { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
]
const startedAt = new Date().toISOString()
/** A blank page is ~3 KB: below 10 KB the capture failed (empty window), so it is never saved as a result. */
const MIN_SHOT_BYTES = 10_000
async function shoot(page, path) {
  await page.locator('[data-persona-shell]').first().waitFor({ state: 'visible', timeout: 15_000 })
  const buffer = await page.screenshot()
  if (buffer.length < MIN_SHOT_BYTES) throw new Error(`blank capture (${String(buffer.length)} bytes < ${String(MIN_SHOT_BYTES)}): ${path}`)
  writeFileSync(path, buffer)
}
const slugOf = label => label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Temp home + free port (D-067). The web host boots without PERSONA_VAULT_TEST_CIPHER now (Keel, D-067 addendum).
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const errors = []
const report = []
const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  try { rmSync(home, { recursive: true, force: true }) } catch { /* temp home still in use: reap-orphans cleans later */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 1_800_000)

async function open(url, scheme, viewport) {
  const context = await browser.newContext({
    reducedMotion: process.env.LUMEN_REDUCED === '1' ? 'reduce' : 'no-preference',
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
    colorScheme: scheme,
    locale: 'pt-BR',
  })
  await context.addInitScript(([dark, withReview]) => {
    localStorage.setItem('persona.rail.collapsed.v1', '0')
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.setItem('persona.devSeed.v1', '1')
    // Opt-in dev seed: three skill proposals, so the decision cycle has several cards to act on.
    localStorage.setItem('persona.devSeed.decisions', '1')
    // Capture-only sample of "Revisar mudanças" (the fake CLI writes no files): the sheet says "Exemplo".
    if (withReview) localStorage.setItem('persona.devSeed.review', '1')
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, [scheme === 'dark', process.env.LUMEN_SCENARIOS?.split(',').includes('review') === true])
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 240)}`))
  if (process.env.LUMEN_TRACE === '1') page.on('console', (m) => { if (m.type() === 'info' && m.text().includes('dev seed')) console.log(`[trace ${scheme} ${viewport.tag}] ${new Date().toISOString().slice(11, 23)} ${m.text().slice(0, 200)}`) })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(9000)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(6000)
  await page.locator('[data-persona-shell]').first().waitFor({ state: 'visible', timeout: 15_000 })
  return { context, page }
}

async function nav(page, label) {
  await page.getByRole('button', { name: 'Visão geral', exact: true }).first().waitFor({ timeout: 20_000 }).catch(() => undefined)
  for (let attempt = 0; attempt < 3 && await page.getByRole('button', { name: label, exact: true }).count() === 0; attempt += 1) {
    for (const toggle of await page.locator('button[aria-controls^="persona-nav-"][aria-expanded="false"]').all()) {
      await toggle.evaluate((node) => { node.click() }).catch(() => undefined)
    }
    await page.waitForTimeout(500)
  }
  const target = page.getByRole('button', { name: label, exact: true }).first()
  await target.evaluate((node) => { node.scrollIntoView({ block: 'center' }) })
  await target.click({ timeout: 10_000 })
  await page.waitForTimeout(1800)
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(400)
}

/** LUMEN_AXE=<path to axe.min.js>: WCAG 2.x A/AA scan of the current page (no repo dependency). */
async function axeViolations(page) {
  if (process.env.LUMEN_AXE === undefined) return null
  await page.addScriptTag({ path: process.env.LUMEN_AXE })
  return page.evaluate(async () => {
    const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }))
  })
}

const infiniteAnimations = page => page.evaluate(() => document.getAnimations().filter(an => an.playState === 'running' && Number(an.effect?.getComputedTiming().iterations) === Infinity).length)

/** DECISIONS-SPEC acceptance on the real app: the same cycle in Visão geral and Aprovações, counters together. */
async function decisionShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  const chip = async () => (await page.locator('#persona-attention-title').first().evaluate(node => node.closest('section')?.querySelector('p')?.textContent ?? '').catch(() => ''))
  const railBadge = async () => page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-nav-item]')].find(node => node.textContent?.startsWith('Aprovações'))
    const id = button?.getAttribute('aria-describedby')
    return id ? document.getElementById(id)?.textContent ?? '' : ''
  })
  const rows = async () => page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id]').count()
  const titles = async () => page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('data-decision-id')}:${node.getAttribute('data-decision-state')}`))
  const portraits = async () => page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id]').evaluateAll(nodes => nodes.map(node => { const img = node.querySelector('img'); return img === null ? 'no-img' : `${img.naturalWidth}x${img.naturalHeight}:${(img.getAttribute('src') ?? '').slice(0, 40)}` }))
  await nav(page, 'Visão geral')
  const before = { chip: await chip(), rail: await railBadge(), rows: await rows(), titles: await titles(), portraits: await portraits() }
  await shoot(page, `${outDir}/decisions-overview-${tag}.png`)
  const axe1 = await axeViolations(page)
  const approve = page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id] button', { hasText: /^Aprovar$/ }).first()
  let afterClick = null
  if (await approve.count() > 0) {
    await approve.click()
    await page.waitForTimeout(260)
    afterClick = { chip: await chip(), rail: await railBadge(), stamp: await page.locator('[data-decision-state="accepted"]').count(), infinite: await infiniteAnimations(page) }
    await shoot(page, `${outDir}/decisions-overview-stamp-${tag}.png`)
    await page.waitForTimeout(1300)
  }
  const gone = { rows: await rows(), chip: await chip(), rail: await railBadge(), titles: await titles() }
  await page.waitForTimeout(4500)
  const late = { rows: await rows(), chip: await chip(), rail: await railBadge(), titles: await titles() }
  await nav(page, 'Aprovações')
  const cards = await page.locator('[data-persona-approvals="reactive"] [data-decision-id]').count()
  await shoot(page, `${outDir}/decisions-approvals-${tag}.png`)
  const axe2 = await axeViolations(page)
  const line = { tag, before, afterClick, gone, late, approvalsReactiveCards: cards, axeOverview: axe1?.length ?? 'skipped', axeApprovals: axe2?.length ?? 'skipped' }
  console.log(`[decisions ${tag}] ${JSON.stringify(line)}`)
  for (const [name, list] of [['overview', axe1], ['approvals', axe2]]) for (const v of list ?? []) console.log(`[axe ${name} ${tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
  decisionReport.push(line)
}
const decisionReport = []

const REVIEW_PASTE = [
  '## Sobre a empresa',
  'A Padaria Aurora vende paes e bolos em Itu desde 2014.',
  '',
  '## Regras e restricoes',
  '- Nunca enviar proposta comercial sem revisao do juridico.',
  '- Respostas de orcamento saem em ate 1 dia util.',
  '',
  '## Clientes',
  '- Maria (dona) aprova orcamentos acima de R$ 500.',
].join('\n')

async function axeLine(page, name, tag) {
  const list = await axeViolations(page)
  for (const v of list ?? []) console.log(`[axe ${name} ${tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
  return list?.length ?? 'skipped'
}

/** "Revisar mudanças" in the complete shell: the list + preview, the clash moment, the success moment. */
async function reviewShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Quadros')
  // the first project card (its title, not the ⋯ menu): the board opens and the sample review opens on its own
  await page.locator('[data-persona-boards] article').first().click({ position: { x: 90, y: 28 }, timeout: 10_000 })
  await page.locator('[data-testid="review-panel"]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(700)
  await shoot(page, `${outDir}/revisar-lista-${tag}.png`)
  const axe1 = await axeLine(page, 'revisar-lista', tag)
  await page.locator('[data-testid="review-apply"]').click()
  await page.locator('[data-testid="review-conflict"]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/revisar-conflito-${tag}.png`)
  const axe2 = await axeLine(page, 'revisar-conflito', tag)
  await page.getByText('Manter os dois', { exact: false }).first().click()
  await page.locator('[data-testid="review-apply"]').click()
  await page.locator('[data-testid="review-applied"]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(900)
  await shoot(page, `${outDir}/revisar-sucesso-${tag}.png`)
  const axe3 = await axeLine(page, 'revisar-sucesso', tag)
  console.log(`[revisar ${tag}] lista axe=${axe1} conflito axe=${axe2} sucesso axe=${axe3}`)
}

/** Importadores: the entry, the review with the rules waiting, the rules accepted, and the confirmation after saving. */
async function bycShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Importadores')
  await page.waitForTimeout(600)
  await shoot(page, `${outDir}/byc-entrada-${tag}.png`)
  await page.getByRole('textbox').first().fill(REVIEW_PASTE)
  await page.getByRole('button', { name: 'Adicionar resposta' }).click()
  await page.getByRole('button', { name: 'Organizar', exact: true }).click()
  await page.locator('[data-persona-byc-review]').waitFor({ timeout: 25_000 })
  await page.waitForTimeout(600)
  await shoot(page, `${outDir}/byc-revisao-${tag}.png`)
  const axe1 = await axeLine(page, 'byc-revisao', tag)
  const acceptAll = page.getByRole('button', { name: /Aceitar todas as regras/u })
  if (await acceptAll.count() > 0) {
    await acceptAll.click()
    await page.waitForTimeout(300)
    await shoot(page, `${outDir}/byc-revisao-regras-aceitas-${tag}.png`)
  }
  await page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).click()
  await page.locator('[data-persona-byc-saved]').waitFor({ timeout: 25_000 })
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/byc-gravado-${tag}.png`)
  const axe2 = await axeLine(page, 'byc-gravado', tag)
  console.log(`[byc ${tag}] revisao axe=${axe1} gravado axe=${axe2}`)
}

/** Segundo cérebro: the home, Permissões, and the new-page dialog. */
async function brainShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Segundo cérebro')
  await page.waitForTimeout(700)
  await shoot(page, `${outDir}/segundo-cerebro-real-${tag}.png`)
  const axe1 = await axeLine(page, 'segundo-cerebro', tag)
  await page.getByRole('button', { name: 'Permissões', exact: true }).click()
  await page.waitForTimeout(600)
  await shoot(page, `${outDir}/segundo-cerebro-permissoes-${tag}.png`)
  const axe2 = await axeLine(page, 'permissoes', tag)
  await page.getByRole('button', { name: 'Voltar', exact: false }).first().click().catch(() => undefined)
  await page.getByRole('button', { name: 'Nova página', exact: true }).first().click({ timeout: 8_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/segundo-cerebro-nova-pagina-${tag}.png`)
  const axe3 = await axeLine(page, 'nova-pagina', tag)
  console.log(`[brain ${tag}] home axe=${axe1} permissoes axe=${axe2} nova-pagina axe=${axe3}`)
}

/**
 * Content the person cannot reach: an element that pokes out of the viewport, or out of an ancestor that CLIPS it
 * (overflow hidden/clip) — an overflow-x auto/scroll ancestor is fine (reachable by scrolling) and only counted.
 */
function probeOverflow() {
  const vw = document.documentElement.clientWidth
  const hits = []
  let scrollers = 0
  const label = (el, r) => {
    const own = typeof el.className === 'string' ? el.className.split(' ')[0] : ''
    // SVG parts carry no class: name the nearest classed ancestor so the culprit can be found.
    let via = ''
    if (own === '') {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const c = typeof p.className === 'string' ? p.className.split(' ')[0] : ''
        if (c !== '') { via = ` in .${c}`; break }
      }
    }
    return `${el.tagName.toLowerCase()}.${own}${via}@${Math.round(r.left)}..${Math.round(r.right)}`
  }
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) scrollers += 1
    // Walk ALL ancestors: an svg (overflow hidden by default) must not hide the scroller further up; but an ancestor
    // that clips the element (it pokes out of that box) makes it unreachable even if a scroller sits above.
    let scrolled = false
    let cutBy = null
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') { scrolled = true; break }
      if ((ox === 'hidden' || ox === 'clip') && cutBy === null) {
        const pr = p.getBoundingClientRect()
        if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) cutBy = p
      }
    }
    if (cutBy !== null) hits.push('cut:' + label(el, r))
    else if (!scrolled && (r.right > vw + 1 || r.left < -1)) hits.push(label(el, r))
  }
  return {
    vw,
    docScrollOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
    offscreen: hits.length,
    scrollers,
    sample: hits.slice(0, 5),
  }
}

const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const viewport of VIEWPORTS) {
      for (const scheme of ['light', 'dark']) {
        if (process.env.LUMEN_ONLY !== undefined && process.env.LUMEN_ONLY !== `${scheme}-${viewport.tag}`) continue
        let opened
        try {
          opened = await open(match[1], scheme, viewport)
        } catch (error) {
          // The shell never showed (empty window): say so for this pass with the browser's own errors, and go on.
          const why = errors.filter(row => row.startsWith(`[${scheme} ${viewport.tag}]`)).slice(-3).join(' | ')
          report.push({ panel: '(boot)', scheme, viewport: viewport.tag, error: String(error).slice(0, 200), console: why.slice(0, 600), at: new Date().toISOString() })
          console.log(`[${viewport.tag} ${scheme}] BOOT FAILED at ${new Date().toISOString()}: ${String(error).slice(0, 120)} :: ${why.slice(0, 300)}`)
          continue
        }
        const { context, page } = opened
        for (const label of (process.env.LUMEN_SKIP_PANELS === '1' ? [] : panels)) {
          try {
            if (label === 'Quadros › projeto') {
              // The board columns live inside a project: open the first project card from Quadros.
              await nav(page, 'Quadros')
              await page.locator('[data-persona-boards] li button, [data-persona-boards] article button').first().click({ timeout: 8000 })
              await page.waitForTimeout(2500)
              await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined)
            } else {
              await nav(page, label)
            }
            const file = `${slugOf(label)}-${scheme}-${viewport.tag}.png`
            await shoot(page, `${outDir}/${file}`)
            const probe = await page.evaluate(probeOverflow)
            report.push({ panel: label, scheme, viewport: viewport.tag, file, ...probe })
            console.log(`[${viewport.tag} ${scheme}] ${label}: offscreen=${probe.offscreen} docΔ=${probe.docScrollOverflow} scrollers=${probe.scrollers}${probe.offscreen > 0 ? ` :: ${probe.sample.join(' | ')}` : ''}`)
          } catch (error) {
            report.push({ panel: label, scheme, viewport: viewport.tag, error: String(error).slice(0, 200) })
            console.log(`[${viewport.tag} ${scheme}] ${label}: FAILED ${String(error).slice(0, 140)}`)
          }
        }
        const scenarios = new Set((process.env.LUMEN_SCENARIOS ?? '').split(',').filter(Boolean))
        for (const [name, run] of [['brain', brainShots], ['byc', bycShots], ['review', reviewShots]]) {
          if (!scenarios.has(name)) continue
          try { await run(page, scheme, viewport) } catch (error) {
            report.push({ panel: `(${name})`, scheme, viewport: viewport.tag, error: String(error).slice(0, 200), at: new Date().toISOString() })
            console.log(`[${name} ${scheme}-${viewport.tag}] FAILED ${String(error).slice(0, 200)}`)
          }
        }
        if (process.env.LUMEN_DECISIONS === '1') {
          try { await decisionShots(page, scheme, viewport) } catch (error) { console.log(`[decisions ${scheme}-${viewport.tag}] FAILED ${String(error).slice(0, 200)}`) }
        }
        await context.close()
      }
    }
    writeFileSync(`${outDir}/report.json`, JSON.stringify({ phase, startedAt, finishedAt: new Date().toISOString(), errors, report, decisionReport }, null, 2))
    const bad = report.filter(row => row.error !== undefined || row.offscreen > 0 || row.docScrollOverflow > 0)
    console.log(`console errors: ${errors.length}${errors.length > 0 ? `\n${errors.slice(0, 6).join('\n')}` : ''}`)
    await finish(0, `lumen viewport shots (${phase}): ${report.length} captures, ${bad.length} with overflow/errors → ${outDir}`)
  } catch (error) {
    await finish(1, `FAILED ${error instanceof Error ? error.stack : String(error)}`)
  }
}
child.stdout.on('data', onData); child.stderr.on('data', onData)
child.on('exit', (code) => { if (!browser) void finish(1, `host exited ${String(code)}\n${out.slice(-1200)}`) })

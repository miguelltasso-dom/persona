#!/usr/bin/env node
// REGRESSÃO DE DESEMPENHO por integração (Gauge 11/11, PLANO-COLHEITA): sobe o app de verdade (host + Chrome headless, home temporária, SEM IA real),
// mede arranque, montagem da interface, memória, tarefas longas, peso transferido e o tour dos 9 painéis, e compara com um baseline.
//
//   node scripts/persona/with-lock.mjs "Gauge perf" --lock build -- node --import tsx/esm scripts/persona/perf-gate.mjs [--runs 3]
//   ...perf-gate.mjs --update-baseline        (grava a mediana como novo baseline; só Gauge/Keel, com a árvore sã; registra data e a razão em --note)
//   ...perf-gate.mjs --no-compare             (só mede e imprime)
// Opções: --root <pasta> · --runs N (padrão 3; mediana) · --baseline <json> (padrão persona-spec/baselines/perf-baseline.json) · --out <pasta> (padrão .maestri/tmp/perf)
//         --host-timeout-ms N · --no-tour · --json · --note "texto"
// Regra de regressão (por métrica; menor é melhor): valor > baseline × (1 + tol%) E valor − baseline > piso. A máquina é compartilhada com ~20 agentes:
// por isso mediana de N, tolerância larga e piso absoluto. Estourou = FALHOU (1) e o relatório diz qual métrica, quanto e as amostras.
// Saída: 0 = PASSOU (ou sem baseline: só mediu), 1 = regressão, 2 = não conseguiu medir (host não subiu, shell não montou…): informativo, o Keel decide.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
export const DEFAULT_BASELINE = 'persona-spec/baselines/perf-baseline.json'

/** Regras: tolPct = quanto pode passar do baseline; floor = diferença mínima absoluta para contar (ruído); unit só para exibir. */
export const RULES = {
  hostReadyMs: { tolPct: 60, floor: 4000, unit: 'ms', label: 'host pronto (URL com token)' },
  shellMountMs: { tolPct: 60, floor: 1500, unit: 'ms', label: 'shell montado na tela' },
  fcpMs: { tolPct: 60, floor: 800, unit: 'ms', label: 'primeira pintura' },
  lcpMs: { tolPct: 60, floor: 1200, unit: 'ms', label: 'maior pintura' },
  onboardingMs: { tolPct: 80, floor: 2500, unit: 'ms', label: 'onboarding até o fim' },
  tourMs: { tolPct: 60, floor: 6000, unit: 'ms', label: 'tour dos 9 painéis' },
  jsHeapMb: { tolPct: 30, floor: 20, unit: 'MB', label: 'memória JS da página' },
  domNodes: { tolPct: 25, floor: 500, unit: '', label: 'nós de DOM' },
  longTaskTotalMs: { tolPct: 100, floor: 600, unit: 'ms', label: 'tarefas longas (soma)' },
  longTaskMaxMs: { tolPct: 100, floor: 250, unit: 'ms', label: 'maior tarefa longa' },
  layoutShift: { tolPct: 100, floor: 0.05, unit: '', label: 'deslocamento de layout (CLS)' },
  scriptMs: { tolPct: 60, floor: 1500, unit: 'ms', label: 'tempo de script' },
  transferKb: { tolPct: 25, floor: 200, unit: 'KB', label: 'peso transferido (JS/CSS/fonte/imagem)' },
  requests: { tolPct: 40, floor: 15, unit: '', label: 'requisições' },
}

// ---------------------------------------------------------------- lógica pura (testada)

export function median(values) {
  const sorted = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return undefined
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** samples: [{ métrica: valor }] → { métrica: { median, samples } } */
export function summarize(samples) {
  const out = {}
  for (const name of new Set(samples.flatMap((s) => Object.keys(s)))) {
    const values = samples.map((s) => s[name]).filter((v) => typeof v === 'number')
    const m = median(values)
    if (m !== undefined) out[name] = { median: round(m), samples: values.map(round) }
  }
  return out
}
const round = (n) => Math.round(n * 1000) / 1000

/** Compara a mediana medida com o baseline. Devolve { regressions, improvements, ok, missing, compared }. */
export function compareToBaseline(summary, baselineMetrics, rules = RULES) {
  const regressions = []
  const improvements = []
  const missing = []
  let compared = 0
  for (const [name, rule] of Object.entries(rules)) {
    const now = summary[name]?.median
    const base = baselineMetrics?.[name]?.median ?? baselineMetrics?.[name]
    if (typeof base !== 'number') { if (now !== undefined) missing.push(name); continue }
    if (now === undefined) { missing.push(name); continue }
    compared += 1
    const limit = base * (1 + rule.tolPct / 100)
    const delta = now - base
    if (now > limit && delta > rule.floor) regressions.push({ metric: name, label: rule.label, baseline: base, now, delta: round(delta), pct: base === 0 ? null : round((delta / base) * 100), limit: round(limit), unit: rule.unit, samples: summary[name].samples })
    else if (delta < -rule.floor && now < base * (1 - rule.tolPct / 100)) improvements.push({ metric: name, label: rule.label, baseline: base, now, unit: rule.unit })
  }
  return { ok: regressions.length === 0, regressions, improvements, missing, compared }
}

export function renderTable(summary, comparison, rules = RULES) {
  const rows = []
  for (const [name, rule] of Object.entries(rules)) {
    const s = summary[name]
    if (s === undefined) continue
    const reg = comparison?.regressions.find((r) => r.metric === name)
    rows.push(`${reg === undefined ? '  ' : '✖ '}${rule.label.padEnd(40)} ${String(s.median).padStart(10)} ${rule.unit}${reg === undefined ? '' : `   (baseline ${reg.baseline}, +${reg.pct ?? '?'}%, limite ${reg.limit})`}  [${s.samples.join(', ')}]`)
  }
  return rows.join('\n')
}

// ---------------------------------------------------------------- medição

const INIT_SCRIPT = `
window.__gaugePerf = { longTasks: [], cls: 0, fcp: undefined, lcp: undefined }
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__gaugePerf.longTasks.push(e.duration) }).observe({ type: 'longtask', buffered: true }) } catch {}
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__gaugePerf.cls += e.value }).observe({ type: 'layout-shift', buffered: true }) } catch {}
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__gaugePerf.fcp = e.startTime }).observe({ type: 'paint', buffered: true }) } catch {}
try { new PerformanceObserver((l) => { const es = l.getEntries(); const last = es[es.length - 1]; if (last) window.__gaugePerf.lcp = last.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch {}
`

async function startHost({ root, hostTimeoutMs, freePort }) {
  const home = mkdtempSync(join(tmpdir(), 'persona-perf-'))
  const port = String(await freePort())
  const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
  const started = Date.now()
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', port], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  const url = await new Promise((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error(`o host não imprimiu a URL em ${hostTimeoutMs / 1000} s:\n${out.slice(-600)}`)), hostTimeoutMs)
    const onData = (chunk) => {
      out += chunk.toString()
      const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(out)
      if (match === null) return
      clearTimeout(timer)
      resolveUrl(match[1])
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`o host saiu cedo (${code}):\n${out.slice(-600)}`)) })
  })
  const stop = () => {
    try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* já saiu */ }
    try { rmSync(home, { recursive: true, force: true }) } catch { /* pasta ocupada */ }
  }
  return { url, hostReadyMs: Date.now() - started, stop }
}

/** Uma amostra de UI: contexto novo (cache frio) carregando a URL. */
async function measureUi({ browser, url, tour }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' })
  const page = await context.newPage()
  await page.addInitScript(INIT_SCRIPT)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('Network.enable')
  const kinds = new Map()
  let transferBytes = 0
  let requests = 0
  cdp.on('Network.responseReceived', (e) => { kinds.set(e.requestId, e.type) })
  cdp.on('Network.loadingFinished', (e) => {
    requests += 1
    if (['Script', 'Stylesheet', 'Font', 'Image'].includes(kinds.get(e.requestId))) transferBytes += e.encodedDataLength ?? 0
  })
  const m = {}
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 90_000 })
  m.shellMountMs = Date.now() - t0
  const t1 = Date.now()
  try {
    const { completePersonaOnboardingOverlay } = await import('./playwright-onboarding.mjs')
    await completePersonaOnboardingOverlay(page, { displayName: 'Gauge Perf', vaultLine: 'Empresa de teste para o gate de desempenho.' })
    m.onboardingMs = Date.now() - t1
  } catch { /* contexto novo mas o host já tem onboarding feito */ }
  if (tour) {
    try {
      const { runCleanHomeTourChecks } = await import('../../packages/persona/persona-e2e/src/boot-gate-bootstrap.ts')
      const t2 = Date.now()
      const result = await runCleanHomeTourChecks(page)
      m.tourMs = Date.now() - t2
      m.tourFailures = result.panelFailures?.length ?? 0
    } catch (error) { m.tourError = String(error).slice(0, 200) }
  }
  const perf = await page.evaluate(() => window.__gaugePerf ?? { longTasks: [], cls: 0 })
  const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  m.fcpMs = perf.fcp
  m.lcpMs = perf.lcp
  m.longTaskTotalMs = perf.longTasks.reduce((a, b) => a + b, 0)
  m.longTaskMaxMs = perf.longTasks.length === 0 ? 0 : Math.max(...perf.longTasks)
  m.layoutShift = perf.cls
  m.jsHeapMb = (metrics.JSHeapUsedSize ?? 0) / 1048576
  m.domNodes = metrics.Nodes
  m.scriptMs = (metrics.ScriptDuration ?? 0) * 1000
  m.transferKb = transferBytes / 1024
  m.requests = requests
  await context.close()
  return m
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const args = { flags: new Set() }
  const withValue = new Set(['--root', '--runs', '--baseline', '--out', '--host-timeout-ms', '--note'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (withValue.has(arg)) {
      if (i + 1 >= argv.length) throw new Error(`${arg} precisa de um valor`)
      args[arg.slice(2)] = argv[++i]
    } else if (arg.startsWith('--')) args.flags.add(arg.slice(2))
    else throw new Error(`argumento inesperado: ${arg}`)
  }
  return args
}

async function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) } catch (error) { console.error(`uso: ${error.message}`); process.exit(2) }
  const root = resolve(args.root ?? REPO_ROOT)
  const runs = Math.max(1, Number(args.runs ?? 3))
  const hostTimeoutMs = Number(args['host-timeout-ms'] ?? 180_000)
  const baselinePath = resolve(root, args.baseline ?? DEFAULT_BASELINE)
  const outDir = resolve(root, args.out ?? '.maestri/tmp/perf')
  mkdirSync(outDir, { recursive: true })
  const log = (message) => console.log(`[perf-gate] ${message}`)
  const samples = []
  let host
  try {
    const { freePort } = await import('./free-port.mjs')
    const { chromium } = createRequire(`${root}/packages/persona/persona-e2e/package.json`)('playwright')
    log('subindo o host (home temporária, sem IA real)…')
    host = await startHost({ root, hostTimeoutMs, freePort })
    log(`host pronto em ${host.hostReadyMs} ms`)
    const browser = await chromium.launch({ channel: 'chrome', headless: true })
    try {
      for (let i = 1; i <= runs; i += 1) {
        const m = await measureUi({ browser, url: host.url, tour: !args.flags.has('no-tour') })
        if (i === 1) m.hostReadyMs = host.hostReadyMs
        samples.push(m)
        log(`amostra ${i}/${runs}: shell ${Math.round(m.shellMountMs)} ms, heap ${round(m.jsHeapMb)} MB, nós ${m.domNodes}, tarefas longas ${Math.round(m.longTaskTotalMs)} ms${m.tourMs === undefined ? '' : `, tour ${Math.round(m.tourMs)} ms`}${m.tourError === undefined ? '' : ` (tour: ${m.tourError})`}`)
      }
    } finally { await browser.close() }
  } catch (error) {
    log(`NÃO MEDIU: ${String(error.message ?? error).slice(0, 600)}`)
    host?.stop()
    process.exit(2)
  }
  host.stop()
  const summary = summarize(samples)
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  if (args.flags.has('update-baseline')) {
    mkdirSync(dirname(baselinePath), { recursive: true })
    writeFileSync(baselinePath, `${JSON.stringify({ geradoEm: new Date().toISOString(), runs, nota: args.note ?? '', metrics: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { median: v.median, samples: v.samples }])) }, null, 2)}\n`)
    log(`baseline gravado em ${baselinePath}`)
    console.log(renderTable(summary, undefined))
    process.exit(0)
  }
  let comparison
  if (!args.flags.has('no-compare') && existsSync(baselinePath)) comparison = compareToBaseline(summary, JSON.parse(readFileSync(baselinePath, 'utf8').replace(/^\uFEFF/u, '')).metrics)
  const report = { geradoEm: new Date().toISOString(), runs, summary, comparison, baseline: comparison === undefined ? null : baselinePath }
  writeFileSync(join(outDir, `perf-${stamp}.json`), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(outDir, 'perf-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
  if (args.flags.has('json')) console.log(JSON.stringify(report, null, 2))
  else {
    console.log(renderTable(summary, comparison))
    if (comparison === undefined) console.log('SEM BASELINE (ou --no-compare): só mediu. Grave com --update-baseline.')
    else if (comparison.ok) console.log(`PASSOU — desempenho: ${comparison.compared} métrica(s) dentro da tolerância${comparison.improvements.length > 0 ? `; ${comparison.improvements.length} melhorou(aram)` : ''}.`)
    else console.log(`FALHOU — desempenho: ${comparison.regressions.length} regressão(ões): ${comparison.regressions.map((r) => `${r.metric} ${r.baseline}→${r.now}${r.unit}`).join(', ')}`)
  }
  process.exit(comparison !== undefined && !comparison.ok ? 1 : 0)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()

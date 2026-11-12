#!/usr/bin/env node
// PRÉ-ACEITE · GPU OCIOSA (DESIGN-01 §2.7 regra 6; Keel 11/11 12:47). Dois modos de medir o mesmo orçamento:
//
//  1) O GATE de animações (`gpu` no preaccept): com a janela sem foco (`window.dispatchEvent(new Event('blur'))`) ou após 16 s sem turno
//     ativo, `document.getAnimations().filter(a => a.playState === 'running').length` TEM DE SER 0. A sonda já o roda em toda captura
//     (`collectProbe(page, { gpu: true })`, padrão ligado; `preaccept.mjs` dá FALHOU em `gpu`). Aqui ele roda sozinho numa página/app aberto:
//       node scripts/persona/preaccept-gpu.mjs --cdp <porta|url> [--page <trecho da url>] [--idle-ms 16000] [--settle-ms 800] [--json <saida.json>]
//
//  2) A MEDIDA de GPU ociosa (meta: ≤ 1,5 % com foco parado, ≤ 0,5 % sem foco/minimizada):
//       --perf <runs.json>   lê a saída do perf-probe-visible.mjs (Cobalt) e dá o veredito por rodada. ATENÇÃO: aquela sonda mede o
//                            TEMPO DE CPU do processo `gpu` (proxy), em passos de 1 ponto; não prova ≤ 0,5 %. Para o número de GPU de verdade use
//                            o contador do Windows (`sampleGpuUtilization`, abaixo) e passe `gpuUtilization` na rodada (ver README dos manifestos).
//       --exe <Persona.exe>  lança o instalado (home/userData descartáveis, porta livre; rode SOB `with-lock.mjs --lock build` e com
//                            `node --import tsx/esm`), roda o gate e mede a GPU com foco e sem foco pelo contador do Windows.
//
// O módulo também EXPORTA o que o perf-probe-visible.mjs precisa para relatar GPU ociosa:
//   import { sampleGpuUtilization, gpuUtilizationFromRows, gpuIdleFromPerfRun } from '../../scripts/persona/preaccept-gpu.mjs'
// Sai com 1 se algo FALHOU, 2 se faltou argumento/alvo.
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gpuGate, gpuIdleVerdict, GPU_IDLE_MS, GPU_LIMITS } from './preaccept-lib.mjs'
import { collectGpuIdle, GPU_SETTLE_MS } from './preaccept-probe.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
const sleep = ms => new Promise(done => { setTimeout(done, ms) })
const fmt = pct => (pct === null || pct === undefined ? 'n/d' : `${pct.toFixed(1).replace('.', ',')} %`)

// ───────────────────────────── contador de GPU do Windows (puro: o parser; impuro: o amostrador) ─────────────────────────────

/** "pid_1234_luid_0x00000000_0x0000AB12_phys_0_eng_0_engtype_3D" → { pid: 1234, engine: '3D' }; undefined se não for desse formato. */
export function parseGpuEngineName(name) {
  const match = /^pid_(\d+)_.*?_engtype_(.+)$/u.exec(String(name))
  return match === null ? undefined : { pid: Number(match[1]), engine: match[2] }
}

/**
 * As linhas do contador (uma por instância de motor por amostra: `{ i, n, v }` = amostra, nome, % do motor) → a GPU dos `pids`.
 * Como o Gerenciador de Tarefas: por amostra soma-se cada TIPO de motor (3D, Copy, VideoDecode…) dos processos e vale o maior; a média das amostras é o número.
 * `pct` é null quando não há nenhuma linha (contador ausente); 0 quando há linhas mas nenhuma é dos `pids` (processo sem motor = ocioso).
 */
export function gpuUtilizationFromRows(rows, pids) {
  if (!Array.isArray(rows) || rows.length === 0) return { pct: null, byEngine: {}, samples: 0, matched: 0 }
  const want = new Set(pids)
  const samples = [...new Set(rows.map(row => row.i))].sort((a, b) => a - b)
  const perSample = new Map(samples.map(i => [i, new Map()]))
  let matched = 0
  for (const row of rows) {
    const info = parseGpuEngineName(row.n)
    if (info === undefined || !want.has(info.pid)) continue
    matched += 1
    const engines = perSample.get(row.i)
    engines.set(info.engine, (engines.get(info.engine) ?? 0) + Number(row.v ?? 0))
  }
  const sampleValues = samples.map(i => Math.max(0, ...perSample.get(i).values()))
  const byEngine = {}
  for (const engine of new Set([...perSample.values()].flatMap(map => [...map.keys()]))) {
    byEngine[engine] = Math.round((samples.reduce((sum, i) => sum + (perSample.get(i).get(engine) ?? 0), 0) / samples.length) * 100) / 100
  }
  const pct = Math.round((sampleValues.reduce((sum, value) => sum + value, 0) / sampleValues.length) * 100) / 100
  return { pct, byEngine, samples: samples.length, matched }
}

function powershell(script, timeoutMs) {
  return new Promise(resolveRun => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      resolveRun({ error, stdout: String(stdout ?? '') })
    })
  })
}

/**
 * Amostra a GPU (contador "GPU Engine" do Windows, pela classe WMI — o nome da classe não depende do idioma do Windows, o do contador depende)
 * dos processos `pids` por `seconds` s. Devolve `{ available: true, pct, byEngine, samples, matched }` ou `{ available: false, reason }`.
 */
export async function sampleGpuUtilization({ pids, seconds = 10 }) {
  if (process.platform !== 'win32') return { available: false, reason: 'só no Windows (contador GPU Engine)' }
  if (pids.length === 0) return { available: false, reason: 'nenhum processo para medir' }
  const pattern = pids.map(pid => `pid_${String(pid)}_`).join('|')
  const script = `
$ErrorActionPreference = 'Stop'
try {
  $rows = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt ${String(Math.max(1, Math.round(seconds)))}; $i++) {
    $start = Get-Date
    Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.Name -match '${pattern}' } | ForEach-Object { [void]$rows.Add([pscustomobject]@{ i = $i; n = $_.Name; v = $_.UtilizationPercentage }) }
    [void]$rows.Add([pscustomobject]@{ i = $i; n = 'tick'; v = 0 })
    $left = 1000 - ((Get-Date) - $start).TotalMilliseconds
    if ($left -gt 0) { Start-Sleep -Milliseconds ([int]$left) }
  }
  ConvertTo-Json -Compress -InputObject @($rows)
} catch { 'ERR:' + $_.Exception.Message }`
  const { error, stdout } = await powershell(script, (seconds + 60) * 1000)
  const text = stdout.trim()
  if (error !== null && text === '') return { available: false, reason: `PowerShell falhou: ${String(error.message).slice(0, 120)}` }
  if (text.startsWith('ERR:')) return { available: false, reason: `contador GPU Engine indisponível: ${text.slice(4, 140)}` }
  let rows
  try { rows = JSON.parse(text) } catch { return { available: false, reason: 'saída do contador ilegível' } }
  // As linhas "tick" marcam que a amostra rodou mesmo sem nenhum motor dos pids (ocioso de verdade = 0, não "sem medida").
  const measured = gpuUtilizationFromRows(rows.map(row => ({ ...row })).filter(Boolean), pids)
  return measured.samples === 0 ? { available: false, reason: 'o contador não devolveu amostras' } : { available: true, ...measured }
}

/** Os pids de `rootPid` e de todos os seus descendentes (a árvore do app que lançamos; nunca o Persona.exe de outro agente). */
export async function processTreePids(rootPid) {
  if (process.platform !== 'win32') return [rootPid]
  const { stdout } = await powershell('Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress', 60_000)
  let rows
  try { rows = JSON.parse(stdout.trim()) } catch { return [rootPid] }
  const children = new Map()
  for (const row of Array.isArray(rows) ? rows : [rows]) children.set(row.ParentProcessId, [...(children.get(row.ParentProcessId) ?? []), row.ProcessId])
  const found = [rootPid]
  for (let at = 0; at < found.length; at += 1) found.push(...(children.get(found[at]) ?? []))
  return found
}

// ───────────────────────────── perf-probe-visible.mjs (Cobalt): relatar a GPU ociosa de uma rodada ─────────────────────────────

/**
 * Uma rodada do perf-probe-visible → `{ focused, unfocused, minimized, source }` em %.
 * Prefere `gpuUtilization` ({focused, unfocused, minimized} do contador do Windows, se a rodada trouxe); senão cai para o `cpuPct` do processo `gpu`
 * (proxy: tempo de CPU do processo de GPU, em passos de 1 ponto) e diz isso em `source`.
 */
export function gpuIdleFromPerfRun(run) {
  if (run === undefined || run.error !== undefined) return { source: 'sem-medida' }
  if (run.gpuUtilization !== undefined) {
    const { focused, unfocused, minimized } = run.gpuUtilization
    return { ...(focused === undefined ? {} : { focused }), ...(unfocused === undefined ? {} : { unfocused }), ...(minimized === undefined ? {} : { minimized }), source: 'contador-gpu' }
  }
  const gpuRow = rows => (Array.isArray(rows) ? rows.filter(row => row.role === 'gpu').reduce((sum, row) => sum + Number(row.cpuPct ?? 0), 0) : undefined)
  const out = { source: 'cpu-do-processo-gpu (proxy, passos de 1 ponto)' }
  const focused = gpuRow(run.idleCpu)
  const unfocused = gpuRow(run.idleCpuUnfocused)
  const minimized = gpuRow(run.idleCpuMinimized)
  if (focused !== undefined) out.focused = focused
  if (unfocused !== undefined) out.unfocused = unfocused
  if (minimized !== undefined) out.minimized = minimized
  return out
}

/** Todas as rodadas do runs.json → `[{ run, source, rows: gpuIdleVerdict(...), ok }]`. Rodada com erro = `ok: false`. */
export function gpuIdleReport(runs, limits = GPU_LIMITS) {
  return runs.map(run => {
    const idle = gpuIdleFromPerfRun(run)
    if (idle.source === 'sem-medida') return { run: run?.run, source: idle.source, rows: [], ok: false, note: run?.error ?? 'rodada sem medida' }
    const { source, ...measured } = idle
    const rows = gpuIdleVerdict(measured, limits)
    return { run: run.run, source, rows, ok: rows.length > 0 && rows.every(row => row.status === 'ok') }
  })
}

// ───────────────────────────── linha de comando ─────────────────────────────

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith('--')) args[arg.slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : '1'
  }
  return args
}

function loadPlaywright() {
  return createRequire(join(repoRoot, 'packages', 'persona', 'persona-e2e', 'package.json'))('playwright')
}

function printGate(gpu, label) {
  const gate = gpuGate(gpu)
  console.log(`preaccept-gpu · ${label}`)
  console.log(`  animações rodando com foco ............ ${String(gpu.focusedRunning)}`)
  console.log(`  sem foco (blur + ${String(gpu.settleMs)} ms) ........... ${String(gpu.afterBlur.count)}  ${gpu.afterBlur.count === 0 ? 'ok' : 'FALHOU'}`)
  if (gpu.afterIdle !== undefined) console.log(`  após ${String(Math.round(gpu.afterIdle.idleMs / 1000))} s parada ................... ${String(gpu.afterIdle.count)}  ${gpu.afterIdle.count === 0 ? 'ok' : 'FALHOU'}`)
  if (!gate.ok) console.log(`  → ${gate.detail}`)
  else if (gate.detail.startsWith('aviso:')) console.log(`  → ${gate.detail.split(' — ')[0]}`)
  return gate
}

function printIdle(rows, source) {
  console.log(`  GPU ociosa (${source}):`)
  for (const row of rows) console.log(`    ${row.label.padEnd(16)} ${fmt(row.pct).padStart(8)}  meta ≤ ${fmt(row.limit)}  ${row.status === 'ok' ? 'ok' : row.status === 'falhou' ? 'FALHOU' : 'não medido'}`)
}

async function runCdp(args) {
  const port = args.cdp
  const endpoint = /^\d+$/u.test(port) ? `http://127.0.0.1:${port}` : port
  const { chromium } = loadPlaywright()
  const browser = await chromium.connectOverCDP(endpoint)
  try {
    const pages = browser.contexts().flatMap(context => context.pages()).filter(page => !page.url().startsWith('devtools://'))
    const wanted = args.page ?? 'dsh-app://app/'
    const page = pages.find(candidate => candidate.url().includes(wanted)) ?? (args.page === undefined ? pages[0] : undefined)
    if (page === undefined) { console.error(`nenhuma página com "${wanted}" em ${endpoint} (páginas: ${pages.map(p => p.url()).join(', ') || 'nenhuma'})`); return 2 }
    const gpu = await collectGpuIdle(page, { settleMs: Number(args['settle-ms'] ?? GPU_SETTLE_MS), idleMs: Number(args['idle-ms'] ?? 0) })
    const gate = printGate(gpu, page.url())
    if (args.json !== undefined) { mkdirSync(dirname(resolve(args.json)), { recursive: true }); writeFileSync(args.json, JSON.stringify({ target: page.url(), gate: gpu, verdict: gate.ok ? 'PASSOU' : 'FALHOU' }, null, 1)) }
    console.log(`VEREDITO: ${gate.ok ? 'PASSOU' : 'FALHOU'}`)
    return gate.ok ? 0 : 1
  } finally {
    await browser.close().catch(() => undefined)
  }
}

function runPerf(args) {
  const runs = JSON.parse(readFileSync(args.perf, 'utf8'))
  const report = gpuIdleReport(Array.isArray(runs) ? runs : [runs])
  for (const item of report) {
    console.log(`rodada ${String(item.run)}${item.note === undefined ? '' : ` · ${item.note}`}`)
    if (item.rows.length > 0) printIdle(item.rows, item.source)
    console.log(`  → ${item.ok ? 'ok' : 'FALHOU'}`)
  }
  if (args.json !== undefined) writeFileSync(args.json, JSON.stringify(report, null, 1))
  const ok = report.length > 0 && report.every(item => item.ok)
  console.log(`VEREDITO: ${ok ? 'PASSOU' : 'FALHOU'}`)
  return ok ? 0 : 1
}

async function runExe(args) {
  let launcher
  try {
    const base = '../../packages/persona/persona-e2e/src'
    launcher = {
      ...(await import(`${base}/installed-cdp.ts`)), ...(await import(`${base}/clean-env.ts`)), ...(await import(`${base}/ports.ts`)), ...(await import(`${base}/process-tree.ts`)),
    }
  } catch (error) {
    console.error(`--exe precisa do carregador TS: node --import tsx/esm scripts/persona/preaccept-gpu.mjs --exe … (${String(error).slice(0, 160)})`)
    return 2
  }
  const { spawn } = await import('node:child_process')
  const root = resolve(args.home ?? join(tmpdir(), `preaccept-gpu-${String(Date.now())}`))
  mkdirSync(join(root, 'home'), { recursive: true })
  mkdirSync(join(root, 'user-data'), { recursive: true })
  const rendererPort = await launcher.probeFreePort()
  const launch = launcher.installedDesktopLaunch({ exe: args.exe, home: join(root, 'home'), userData: join(root, 'user-data'), rendererPort })
  const env = { ...launcher.cleanChildEnv(process.env), ...launch.env }
  const child = spawn(launch.exe, [...launch.args], { env, stdio: 'ignore', windowsHide: false })
  const { chromium } = loadPlaywright()
  let browser
  try {
    await launcher.waitForInstalledCdp(rendererPort, 240_000)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(rendererPort)}`)
    let page
    for (const deadline = Date.now() + 120_000; Date.now() < deadline && page === undefined; await sleep(200)) {
      page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('dsh-app://app/'))
    }
    if (page === undefined) { console.error('nenhuma página dsh-app://app/'); return 2 }
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
    await sleep(3_000)
    const pids = await processTreePids(child.pid)
    const seconds = Number(args.seconds ?? 10)
    // 1) GPU com foco parado (a janela está no ar, ninguém mexe). 2) o gate: blur → animações. 3) GPU sem foco, depois do blur ter pousado.
    const focused = await sampleGpuUtilization({ pids, seconds })
    await page.evaluate(() => { window.dispatchEvent(new Event('blur')) })
    await sleep(Number(args['settle-ms'] ?? GPU_SETTLE_MS))
    const unfocused = await sampleGpuUtilization({ pids, seconds })
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')) })
    const gpu = await collectGpuIdle(page, { settleMs: Number(args['settle-ms'] ?? GPU_SETTLE_MS), idleMs: Number(args['idle-ms'] ?? 0) })
    const gate = printGate(gpu, `${args.exe} (${String(pids.length)} processos)`)
    const measured = {}
    if (focused.available) measured.focused = focused.pct
    if (unfocused.available) measured.unfocused = unfocused.pct
    const rows = gpuIdleVerdict({ focused: measured.focused ?? null, unfocused: measured.unfocused ?? null })
    printIdle(rows, focused.available ? 'contador GPU Engine do Windows' : `indisponível: ${focused.reason}`)
    const over = rows.some(row => row.status === 'falhou')
    const verdict = gate.ok && !over ? 'PASSOU' : 'FALHOU'
    if (args.json !== undefined) writeFileSync(args.json, JSON.stringify({ exe: args.exe, gate: gpu, gpuUtilization: measured, gpuDetails: { focused, unfocused }, verdict }, null, 1))
    console.log(`VEREDITO: ${verdict}`)
    return verdict === 'PASSOU' ? 0 : 1
  } finally {
    await browser?.close().catch(() => undefined)
    if (child.pid !== undefined) await launcher.killProcessTree(child.pid).catch(() => undefined)
    child.kill('SIGTERM')
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.perf !== undefined) return runPerf(args)
  if (args.cdp !== undefined) return runCdp(args)
  if (args.exe !== undefined) return runExe(args)
  console.error('uso: node scripts/persona/preaccept-gpu.mjs --cdp <porta|url> [--page <trecho>] [--idle-ms 16000] [--settle-ms 800] [--json <saida>]\n     node scripts/persona/preaccept-gpu.mjs --perf <runs.json do perf-probe-visible> [--json <saida>]\n     node --import tsx/esm scripts/persona/preaccept-gpu.mjs --exe <Persona.exe> [--seconds 10] [--idle-ms 16000]   (sob with-lock --lock build)')
  console.error(`meta (DESIGN-01 §2.7): sem foco ou após ${String(GPU_IDLE_MS / 1000)} s sem turno → 0 animações rodando; GPU ≤ ${String(GPU_LIMITS.focusedPct)} % com foco parado, ≤ ${String(GPU_LIMITS.unfocusedPct)} % sem foco`)
  return 2
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exit(code) }, error => { console.error(error); process.exit(2) })
}

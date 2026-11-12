// PRÉ-ACEITE MECÂNICO (Keel/Muse 05/11 03:27): confere um lote de capturas ANTES de a Muse julgar o desenho.
//
//   node scripts/persona/preaccept.mjs --manifest scripts/persona/preaccept-manifests/<dono>.json [--dir <capturas>] [--out <pasta>] [--log <arquivo>]… [--report-only] [--legacy-ok]
//   node scripts/persona/preaccept.mjs --init --dir <capturas> --owner <Nome> [--template "{scene}-{scheme}-{viewport}"]   (esboça o manifesto a partir das imagens que existem)
//
// O manifesto diz o que se espera: { owner, bundle, dir, scenes:[{id, allowCurrency?, allowExample?, allowPopover?, allowPessoa?, allowCreditoLicenca?, skipChecks?: ["foco"], shell?}], schemes?, viewports?, roster?, fileTemplate?, schemeNames?, viewportNames?, sizes?, logs?, skipChecks? }.
// Para cada cena × tema × tamanho confere: cobertura (imagem existe, não está em branco), axe crítico/sério, alvos ≥ 24 px (target-size), overflow horizontal,
// console limpo, texto proibido (lista tipada; inclui RealTurnCapError e "NOVA VERSÃO:" cru), artigo antes de nome de persona, tema certo, folhagem do trilho, imagens quebradas, ícones vazios e foco visível no 1º Tab.
// D-103c (11/11): também REPROVA "a pessoa" na fala de persona (`fala`), chip "Exemplo" (`exemplo`), inicial no lugar do rosto (`rosto`), chip/controle duplicado no composer (`composer`)
// e popover cobrindo mensagem (`popover`); a sonda v3 mede, sidecar antigo = INCOMPLETO (`--legacy-ok` em lote antigo). `allowExample`/`allowPopover`/`allowPessoa` dispensam UMA regra numa cena e aparecem no relatório.
// A fonte é a sonda (`<captura>.probe.json`, gravada por `preaccept-probe.mjs`); lotes antigos ainda dão axe/overflow/tema pelos logs (`--log`).
// Saída: preaccept-report.json + preaccept-report.md (PASSOU / FALHOU / INCOMPLETO por cena e a razão; "pronto para a Muse" = só o que passou em todos os modos).
// Sai com 1 se alguma cena não está pronta (use --report-only para sempre sair com 0).
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReport, evaluateScene, parseLegacyLog, parseLegacyReportJson, plan, renderMarkdown, verdictOf, D103C_CHECKS, DESIGN01_CHECKS, DEFAULT_ROSTER, DEFAULT_SCHEMES, DEFAULT_VIEWPORTS } from './preaccept-lib.mjs'

/** O que só a sonda dá: em lote antigo (--legacy-ok) fica de fora quando não há como saber; axe, overflow e cobertura continuam exigidos. */
const SONDA_ONLY = new Set(['console', 'proibidos', 'artigo', 'folhagem', 'imagens', 'icones', 'foco', 'tema', 'alvos', ...D103C_CHECKS, ...DESIGN01_CHECKS])
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function parseArgs(argv) {
  const args = { logs: [], reports: [], flags: new Set() }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--log') args.logs.push(argv[++i])
    else if (arg === '--report') args.reports.push(argv[++i])
    else if (arg.startsWith('--') && ['--manifest', '--dir', '--out', '--owner', '--template'].includes(arg)) args[arg.slice(2)] = argv[++i]
    else if (arg.startsWith('--')) args.flags.add(arg.slice(2))
  }
  return args
}

const abs = (path) => (isAbsolute(path) ? path : resolve(process.cwd(), path))

/** Largura × altura de um PNG pelo cabeçalho (IHDR); undefined se não for PNG. */
export function pngInfo(path) {
  const stat = statSync(path)
  const head = readFileSync(path).subarray(0, 24)
  const isPng = head.length >= 24 && head.readUInt32BE(0) === 0x89504e47
  return { bytes: stat.size, ...(isPng ? { width: head.readUInt32BE(16), height: head.readUInt32BE(20) } : {}) }
}

function readJson(path) { return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/u, '')) }

/** Lote do Gauge (dia no app): dia-NN-claro/escuro.png + tela.json (texto por passo) + axe.json (blocking/advisory). */
function gaugeDayLegacy(dir, manifest) {
  const result = { textByStep: new Map(), allText: undefined, axe: undefined }
  const telaPath = join(dir, manifest.legacyText?.file ?? 'tela.json')
  if (existsSync(telaPath)) {
    for (const item of readJson(telaPath)) {
      const step = String(item.step)
      result.textByStep.set(step, `${result.textByStep.get(step) ?? ''}\n${item.text ?? ''}`)
      result.allText = `${result.allText ?? ''}\n${item.text ?? ''}`
    }
  }
  const axePath = join(dir, manifest.legacyAxe?.file ?? 'axe.json')
  if (existsSync(axePath)) {
    const axe = readJson(axePath)
    const blocking = (axe.blocking ?? []).map(item => (typeof item === 'string' ? { impact: 'serious', id: item, nodes: 1 } : { impact: item.impact ?? 'serious', id: item.id ?? 'axe', nodes: item.nodes ?? 1 }))
    result.axe = { axeCount: blocking.length, axeList: blocking }
  }
  return result
}

function loadLegacy(manifest, dir, logPaths, reportPaths) {
  const merged = new Map()
  const mergeIn = (parsed) => {
    for (const [key, value] of parsed) {
      const previous = merged.get(key)
      merged.set(key, previous === undefined ? value : { ...previous, ...Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) })
    }
  }
  // Primeiro os report.json agregados, depois os logs (em ordem de tempo): o que foi refeito depois vence.
  for (const reportPath of [...(manifest.reports ?? []).map(path => resolve(repoRoot, path)), ...reportPaths.map(abs)]) {
    if (!existsSync(reportPath)) { console.log(`[aviso] report.json não encontrado: ${reportPath}`); continue }
    mergeIn(parseLegacyReportJson(readJson(reportPath)))
  }
  for (const logPath of [...(manifest.logs ?? []).map(path => resolve(repoRoot, path)), ...logPaths.map(abs)]) {
    if (!existsSync(logPath)) { console.log(`[aviso] log não encontrado: ${logPath}`); continue }
    mergeIn(parseLegacyLog(readFileSync(logPath, 'utf8')))
  }
  const gauge = manifest.legacyKind === 'gauge-day' ? gaugeDayLegacy(dir, manifest) : undefined
  return { merged, gauge }
}

function legacyFor(row, manifest, { merged, gauge }) {
  const viewportRaw = manifest.viewportNames?.[row.viewport] ?? row.viewport
  const keys = [`${row.scene}|${row.scheme}|${viewportRaw}`, `${row.scene}|${row.scheme}|${row.viewport}`]
  const found = keys.map(key => merged.get(key)).find(value => value !== undefined)
  const legacy = { ...(found ?? {}) }
  if (gauge !== undefined) {
    if (gauge.axe !== undefined) Object.assign(legacy, gauge.axe)
    const step = String(Number(row.scene))
    // scope "all": o tela.json do spec marca todo item com o mesmo passo; vale o dia inteiro para cada captura (conservador: um erro em qualquer ponto do fio reprova).
    if (manifest.legacyText?.scope === 'all' && gauge.allText !== undefined) legacy.text = gauge.allText
    else if (gauge.textByStep.has(step)) legacy.text = gauge.textByStep.get(step)
  }
  return Object.keys(legacy).length === 0 ? undefined : legacy
}

function initManifest(args) {
  const dir = abs(args.dir ?? '.')
  const template = args.template ?? '{scene}-{scheme}-{viewport}'
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pieces = { '{scene}': '(?<scene>.+?)', '{scheme}': '(?<scheme>light|dark|claro|escuro)', '{viewport}': '(?<viewport>\\d+x\\d+|zoom\\d+|\\d+)' }
  const source = template.split(/(\{scene\}|\{scheme\}|\{viewport\})/u).map(part => pieces[part] ?? escape(part)).join('')
  const pattern = new RegExp(`^${source}\\.png$`, 'u')
  const scenes = new Set()
  for (const file of readdirSync(dir)) {
    const match = pattern.exec(file)
    if (match?.groups !== undefined && !match.groups.scene.startsWith('_') && !match.groups.scene.startsWith('debug')) scenes.add(match.groups.scene)
  }
  const manifest = { owner: args.owner ?? '?', bundle: '?', dir: args.dir ?? '.', fileTemplate: template, schemes: DEFAULT_SCHEMES, viewports: DEFAULT_VIEWPORTS, roster: DEFAULT_ROSTER, scenes: [...scenes].sort().map(id => ({ id })) }
  console.log(JSON.stringify(manifest, null, 2))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.flags.has('init')) return initManifest(args)
  if (args.manifest === undefined) {
    console.log('uso: node scripts/persona/preaccept.mjs --manifest <json> [--dir <capturas>] [--out <pasta>] [--log <arquivo>]… [--report-only]')
    return 2
  }
  const manifestPath = abs(args.manifest)
  const manifest = readJson(manifestPath)
  const dir = abs(args.dir ?? (manifest.dir !== undefined ? resolve(repoRoot, manifest.dir) : dirname(manifestPath)))
  const outDir = abs(args.out ?? dir)
  if (!existsSync(dir)) { console.log(`pasta de capturas não existe: ${dir}`); return 2 }
  const rows = plan(manifest)
  if (rows.length === 0) { console.log('o manifesto não lista nenhuma cena'); return 2 }
  const legacySources = loadLegacy(manifest, dir, args.logs, args.reports)
  const roster = manifest.roster ?? DEFAULT_ROSTER
  // --legacy-ok: lote antigo, sem sonda. O que não dá para verificar fica de fora (o relatório avisa); o que dá (cobertura, axe, overflow, tema) continua valendo.
  const legacyOk = args.flags.has('legacy-ok')
  if (legacyOk) manifest.legacyOk = true
  const skip = new Set(manifest.skipChecks ?? [])
  const results = new Map()
  const expected = new Set()
  for (const row of rows) {
    expected.add(`${row.file}.png`)
    const pngPath = join(dir, `${row.file}.png`)
    const png = existsSync(pngPath) ? pngInfo(pngPath) : undefined
    const probePath = join(dir, `${row.file}.probe.json`)
    const probe = existsSync(probePath) ? readJson(probePath) : undefined
    const checks = evaluateScene(row, { png, probe, legacy: legacyFor(row, manifest, legacySources) }, { roster, sizes: manifest.sizes }).filter(check => !skip.has(check.check) && !(row.skipChecks ?? []).includes(check.check) && !(legacyOk && check.status === 'nao-verificado' && SONDA_ONLY.has(check.check) && (probe === undefined || D103C_CHECKS.includes(check.check) || DESIGN01_CHECKS.includes(check.check))))
    results.set(row.file, { checks, verdict: verdictOf(checks) })
  }
  const report = buildReport(manifest, rows, results)
  report.dir = dir
  report.extras = readdirSync(dir).filter(file => file.endsWith('.png') && !expected.has(file) && !file.startsWith('_') && !file.startsWith('debug')).slice(0, 200)
  mkdirSync(outDir, { recursive: true })
  const stem = args.flags.has('named') ? `preaccept-report-${(manifest.owner ?? 'x').toLowerCase()}` : 'preaccept-report'
  writeFileSync(join(outDir, `${stem}.json`), JSON.stringify(report, null, 2))
  writeFileSync(join(outDir, `${stem}.md`), renderMarkdown(report))
  const t = report.totals
  console.log(`pré-aceite ${report.owner} (bundle ${report.bundle}): ${t.captures} capturas → ${t.passou} PASSOU, ${t.falhou} FALHOU, ${t.incompleto} INCOMPLETO · cenas prontas para a Muse: ${t.scenesReady}/${t.scenes}`)
  for (const item of report.notReady) {
    const first = report.scenes.find(scene => scene.scene === item.scene && scene.verdict === item.verdict)
    const bad = (first?.checks ?? []).filter(check => check.status !== 'ok')
    const unverified = bad.filter(check => check.status === 'nao-verificado').map(check => check.check)
    const why = [...bad.filter(check => check.status === 'falhou').map(check => `${check.check}${check.detail === '' ? '' : ` (${check.detail.slice(0, 110)})`}`), ...(unverified.length > 0 ? [`sem verificar: ${unverified.join(', ')}`] : [])].join('; ')
    console.log(`  ${item.verdict.padEnd(10)} ${item.scene} [${item.failing.length}/${item.modes} modos] ${why || 'sem imagem'}`)
  }
  if (report.warnings.length > 0) console.log(`  avisos (não reprovam): ${report.warnings.length}, ex.: ${report.warnings[0].scene} → ${report.warnings[0].detail.slice(0, 90)}`)
  if (report.extras.length > 0) console.log(`  (${report.extras.length} imagem(ns) na pasta fora do manifesto, ex.: ${report.extras.slice(0, 3).join(', ')})`)
  console.log(`relatório: ${join(outDir, `${stem}.md`)}`)
  return report.notReady.length > 0 && !args.flags.has('report-only') ? 1 : 0
}

if (process.argv[1] !== undefined && basename(process.argv[1]) === 'preaccept.mjs') {
  main().then(code => process.exit(code), (error) => { console.error(error); process.exit(2) })
}

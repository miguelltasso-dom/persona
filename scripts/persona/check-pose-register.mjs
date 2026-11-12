#!/usr/bin/env node
// REGISTRO IDÊNTICO DE POSE/EXPRESSÃO (Gauge 12/11, item 21 "Personas vivas"): compara um candidato com a imagem BASE da mesma persona.
// A Brush roda ANTES de entregar: só o que está dentro da máscara (o rosto) pode ter mudado; todo o resto tem de ser o mesmo desenho, no mesmo lugar, na mesma escala.
//
//   node scripts/persona/check-pose-register.mjs --base atlas-base.png --candidate atlas-feliz.png --mask 120,60,80,70 [--mask x,y,w,h …]
// Opções: --alpha-threshold N (padrão 8: alfa acima disso conta como "desenho") · --bbox-tol PX (padrão 1) · --centroid-tol PX (padrão 0.5)
//         --channel-tol N (padrão 0: diferença máxima de canal, em cor pré-multiplicada, que ainda conta como igual)
//         --max-diff-pixels N (padrão 0) · --max-diff-ratio R (padrão 0; fração da área FORA da máscara) · --require-change (exige alguma mudança DENTRO da máscara)
//         --diff-out arquivo.png (desenha onde difere: magenta = fora da máscara, amarelo = dentro, ciano = contorno da máscara) · --json · --report arquivo.json · --quiet
//
// Checagens (todas precisam passar):
//   (a) dimensões iguais;
//   (b) caixa do alfa e centroide do alfa iguais, dentro da tolerância;
//   (c) pixels diferentes FORA da máscara = 0 (ou abaixo do limiar); a comparação é em cor pré-multiplicada pelo alfa: o RGB escondido de um pixel transparente não conta;
//   (d) diz ONDE falhou: caixa dos pixels diferentes, células 8×8 com contagem, e as primeiras coordenadas com a cor de cada lado.
// Saída: 0 = PASSOU, 1 = FALHOU, 2 = uso errado / arquivo ilegível / máscara fora da imagem.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

export class UsageError extends Error {}

export const DEFAULTS = { alphaThreshold: 8, bboxTol: 1, centroidTol: 0.5, channelTol: 0, maxDiffPixels: 0, maxDiffRatio: 0 }

// ---------------------------------------------------------------- sharp (resolve de vários lugares: worktree sem node_modules)

export function loadSharp() {
  const bases = [`${REPO_ROOT}/package.json`, `${REPO_ROOT}/scripts/persona/build-assets.mjs`, `${REPO_ROOT}/apps/desktop/package.json`, `${REPO_ROOT}/apps/web/package.json`]
  for (const base of bases) {
    try { return createRequire(base)('sharp') } catch { /* próximo */ }
  }
  throw new UsageError('o módulo "sharp" não foi encontrado (pnpm install?)')
}

/** Lê uma imagem como RGBA de 8 bits, sem girar, sem mexer em cor. */
export async function readRgba(path, sharp = loadSharp()) {
  if (!existsSync(path)) throw new UsageError(`arquivo não existe: ${path}`)
  try {
    const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    return { width: info.width, height: info.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), path }
  } catch (error) { throw new UsageError(`não consegui ler a imagem ${path}: ${String(error.message ?? error).slice(0, 160)}`) }
}

// ---------------------------------------------------------------- máscaras

/** "x,y,w,h" → { x, y, w, h } (inteiros, w e h > 0). */
export function parseMask(text) {
  const parts = String(text).split(/[,\s]+/u).filter(Boolean)
  if (parts.length !== 4 || !parts.every((part) => /^-?\d+$/u.test(part))) throw new UsageError(`máscara inválida "${text}": use x,y,w,h em pixels inteiros`)
  const [x, y, w, h] = parts.map(Number)
  if (x < 0 || y < 0 || w <= 0 || h <= 0) throw new UsageError(`máscara inválida "${text}": x e y não podem ser negativos, w e h precisam ser maiores que zero`)
  return { x, y, w, h }
}

export function checkMasksInside(masks, width, height) {
  for (const mask of masks) {
    if (mask.x + mask.w > width || mask.y + mask.h > height) throw new UsageError(`a máscara ${mask.x},${mask.y},${mask.w},${mask.h} passa da imagem (${width}×${height})`)
  }
}

const inAnyMask = (masks, x, y) => masks.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h)

// ---------------------------------------------------------------- (b) alfa: caixa e centroide

/** Caixa do alfa (pixels acima do limiar) e centroide ponderado pelo alfa. bbox = null quando não há desenho. */
export function alphaStats(img, threshold = DEFAULTS.alphaThreshold) {
  const { width, height, data } = img
  let x0 = width, y0 = height, x1 = -1, y1 = -1, weight = 0, sx = 0, sy = 0, count = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = data[(y * width + x) * 4 + 3]
      if (a === 0) continue
      weight += a; sx += a * x; sy += a * y
      if (a > threshold) { count += 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    }
  }
  return { bbox: count === 0 ? null : { x0, y0, x1, y1 }, count, cx: weight === 0 ? null : sx / weight, cy: weight === 0 ? null : sy / weight }
}

export function compareAlpha(base, cand, { alphaThreshold = DEFAULTS.alphaThreshold, bboxTol = DEFAULTS.bboxTol, centroidTol = DEFAULTS.centroidTol } = {}) {
  const a = alphaStats(base, alphaThreshold)
  const b = alphaStats(cand, alphaThreshold)
  const reasons = []
  let delta
  let centroid
  if (a.bbox === null && b.bbox === null) return { ok: true, base: a, cand: b, delta, centroid, reasons, note: 'as duas imagens são totalmente transparentes' }
  if (a.bbox === null || b.bbox === null) {
    reasons.push(a.bbox === null ? 'a base não tem desenho (alfa vazio) e o candidato tem' : 'o candidato não tem desenho (alfa vazio) e a base tem')
    return { ok: false, base: a, cand: b, delta, centroid, reasons }
  }
  delta = { left: b.bbox.x0 - a.bbox.x0, top: b.bbox.y0 - a.bbox.y0, right: b.bbox.x1 - a.bbox.x1, bottom: b.bbox.y1 - a.bbox.y1 }
  for (const [side, value] of Object.entries(delta)) if (Math.abs(value) > bboxTol) reasons.push(`caixa do alfa: lado ${{ left: 'esquerdo', top: 'de cima', right: 'direito', bottom: 'de baixo' }[side]} mudou ${value > 0 ? '+' : ''}${value} px (tolerância ${bboxTol})`)
  centroid = { dx: round(b.cx - a.cx), dy: round(b.cy - a.cy) }
  centroid.dist = round(Math.hypot(centroid.dx, centroid.dy))
  if (centroid.dist > centroidTol) reasons.push(`centroide do alfa andou ${centroid.dist} px (dx ${centroid.dx}, dy ${centroid.dy}; tolerância ${centroidTol})`)
  return { ok: reasons.length === 0, base: a, cand: b, delta, centroid, reasons }
}

const round = (n) => Math.round(n * 1000) / 1000

// ---------------------------------------------------------------- (c)(d) diferença fora da máscara

/** Diferença visível entre dois pixels: máximo, entre R, G, B pré-multiplicados e A, da diferença absoluta. 0 quando os dois são transparentes. */
export function pixelDelta(d1, o1, d2, o2) {
  const a1 = d1[o1 + 3]
  const a2 = d2[o2 + 3]
  if (a1 === 0 && a2 === 0) return 0
  let delta = Math.abs(a1 - a2)
  for (let c = 0; c < 3; c += 1) {
    const diff = Math.abs((d1[o1 + c] * a1) / 255 - (d2[o2 + c] * a2) / 255)
    if (diff > delta) delta = diff
  }
  return delta
}

const GRID = 8

export function diffOutside(base, cand, masks, { channelTol = DEFAULTS.channelTol, maxDiffPixels = DEFAULTS.maxDiffPixels, maxDiffRatio = DEFAULTS.maxDiffRatio } = {}) {
  const { width, height } = base
  const cellW = Math.ceil(width / GRID)
  const cellH = Math.ceil(height / GRID)
  const cells = new Map()
  const samples = []
  let outsideArea = 0, differing = 0, maxDelta = 0, insideArea = 0, insideDiffering = 0
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4
      const delta = pixelDelta(base.data, o, cand.data, o)
      if (inAnyMask(masks, x, y)) { insideArea += 1; if (delta > channelTol) insideDiffering += 1; continue }
      outsideArea += 1
      if (delta <= channelTol) continue
      differing += 1
      if (delta > maxDelta) maxDelta = delta
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
      const key = `${Math.floor(y / cellH)},${Math.floor(x / cellW)}`
      cells.set(key, (cells.get(key) ?? 0) + 1)
      if (samples.length < 8) samples.push({ x, y, base: [...base.data.subarray(o, o + 4)], cand: [...cand.data.subarray(o, o + 4)], delta: round(delta) })
    }
  }
  const rawRatio = outsideArea === 0 ? 0 : differing / outsideArea
  const worstCells = [...cells.entries()].map(([key, count]) => {
    const [row, col] = key.split(',').map(Number)
    return { row, col, x: col * cellW, y: row * cellH, w: Math.min(cellW, width - col * cellW), h: Math.min(cellH, height - row * cellH), count }
  }).sort((p, q) => q.count - p.count || p.row - q.row || p.col - q.col).slice(0, 5)
  // Cada limite RELAXA o outro: passa se os pixels diferentes couberem no limite de pixels OU na proporção da área de fora (padrão 0 e 0 = nenhum pixel).
  const ok = differing <= maxDiffPixels || rawRatio <= maxDiffRatio
  return { ok, outsideArea, differing, ratio: Math.round(rawRatio * 1e6) / 1e6, maxDelta: round(maxDelta), bbox: differing === 0 ? null : { x0, y0, x1, y1 }, cells: worstCells, samples, insideArea, insideDiffering, limits: { channelTol, maxDiffPixels, maxDiffRatio } }
}

// ---------------------------------------------------------------- tudo junto

/** @returns {{ ok: boolean, checks: {id:string,label:string,ok:boolean|null,detail:string}[], dimensions: any, alpha?: any, outside?: any, masks: any[] }} */
export function compareRegister(base, cand, options = {}) {
  const opts = { ...DEFAULTS, ...options }
  const masks = options.masks ?? []
  const checks = []
  const dimsOk = base.width === cand.width && base.height === cand.height
  const dimensions = { base: [base.width, base.height], cand: [cand.width, cand.height] }
  checks.push({ id: 'dimensoes', label: 'dimensões iguais', ok: dimsOk, detail: dimsOk ? `${base.width}×${base.height}` : `base ${base.width}×${base.height}, candidato ${cand.width}×${cand.height}: o candidato foi redimensionado ou cortado; exporte no mesmo tamanho da base` })
  if (!dimsOk) {
    for (const [id, label] of [['alfa', 'caixa e centroide do alfa'], ['fora-da-mascara', 'pixels fora da máscara']]) checks.push({ id, label, ok: null, detail: 'não avaliado: as dimensões diferem' })
    return { ok: false, checks, dimensions, masks }
  }
  checkMasksInside(masks, base.width, base.height)
  const alpha = compareAlpha(base, cand, opts)
  checks.push({ id: 'alfa', label: 'caixa e centroide do alfa', ok: alpha.ok, detail: alpha.ok ? alphaLine(alpha) : alpha.reasons.join('; ') })
  const outside = diffOutside(base, cand, masks, opts)
  checks.push({ id: 'fora-da-mascara', label: 'pixels fora da máscara', ok: outside.ok, detail: outside.differing === 0 ? `0 de ${outside.outsideArea} pixels diferem fora da máscara` : outsideLine(outside, opts) })
  if (options.requireChange === true) {
    const changed = outside.insideDiffering > 0
    checks.push({ id: 'mudou-dentro', label: 'mudança dentro da máscara', ok: changed, detail: changed ? `${outside.insideDiffering} pixels mudaram dentro da máscara` : 'nada mudou dentro da máscara: o candidato é igual à base onde deveria estar a expressão nova' })
  }
  return { ok: checks.every((check) => check.ok !== false), checks, dimensions, alpha, outside, masks }
}

const box = (b) => `x=${b.x0}..${b.x1}, y=${b.y0}..${b.y1}`
function alphaLine(alpha) {
  if (alpha.note !== undefined) return alpha.note
  return `caixa ${box(alpha.base.bbox)} (Δ ${alpha.delta.left}/${alpha.delta.top}/${alpha.delta.right}/${alpha.delta.bottom}), centroide Δ ${alpha.centroid.dist} px`
}
function outsideLine(outside, opts) {
  const pct = (outside.ratio * 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  const where = outside.cells.map((c) => `linha ${c.row + 1}/coluna ${c.col + 1} (x=${c.x}..${c.x + c.w - 1}, y=${c.y}..${c.y + c.h - 1}): ${c.count} px`).join('; ')
  const samples = outside.samples.slice(0, 3).map((s) => `(${s.x},${s.y}) base rgba(${s.base.join(',')}) → candidato rgba(${s.cand.join(',')})`).join('; ')
  return `${outside.differing} pixel(s) diferem fora da máscara (${pct}% da área de fora; limite ${opts.maxDiffPixels} px ou ${opts.maxDiffRatio * 100}%), na caixa ${box(outside.bbox)}, maior diferença ${outside.maxDelta}; onde: ${where}; exemplos: ${samples}`
}

export function renderText(report, { base, candidate, masks } = {}) {
  const lines = []
  for (const check of report.checks) lines.push(`${check.ok === true ? 'ok' : check.ok === false ? 'FALHOU' : 'pulado'} [${check.label}] ${check.detail}`)
  const maskText = (masks ?? report.masks ?? []).map((m) => `${m.x},${m.y},${m.w},${m.h}`).join(' | ') || 'nenhuma (qualquer diferença falha)'
  lines.push(`${report.ok ? 'PASSOU' : 'FALHOU'} — registro de pose${base === undefined ? '' : `: ${base} × ${candidate}`}; máscara: ${maskText}.`)
  return lines.join('\n')
}

// ---------------------------------------------------------------- PNG de diferenças

/** Desenha a base esmaecida, o contorno da máscara (ciano), diferenças DENTRO (amarelo) e FORA (magenta). */
export async function writeDiffPng(path, base, cand, masks, { channelTol = DEFAULTS.channelTol } = {}, sharp = loadSharp()) {
  const { width, height } = base
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4
      const a = base.data[o + 3] / 255
      const shade = 235 - Math.round(a * 140) // fundo claro; o desenho da base fica cinza
      out[o] = out[o + 1] = out[o + 2] = shade
      out[o + 3] = 255
      if (pixelDelta(base.data, o, cand.data, o) > channelTol) {
        const inside = inAnyMask(masks, x, y)
        out[o] = 255; out[o + 1] = inside ? 200 : 0; out[o + 2] = inside ? 0 : 200
      }
    }
  }
  for (const m of masks) {
    for (let x = m.x; x < m.x + m.w; x += 1) for (const y of [m.y, m.y + m.h - 1]) { const o = (y * width + x) * 4; out[o] = 0; out[o + 1] = 190; out[o + 2] = 230; out[o + 3] = 255 }
    for (let y = m.y; y < m.y + m.h; y += 1) for (const x of [m.x, m.x + m.w - 1]) { const o = (y * width + x) * 4; out[o] = 0; out[o + 1] = 190; out[o + 2] = 230; out[o + 3] = 255 }
  }
  mkdirSync(dirname(resolve(path)), { recursive: true })
  await sharp(Buffer.from(out.buffer), { raw: { width, height, channels: 4 } }).png().toFile(resolve(path))
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const args = { masks: [], flags: new Set() }
  const withValue = new Set(['--base', '--candidate', '--cand', '--alpha-threshold', '--bbox-tol', '--centroid-tol', '--channel-tol', '--max-diff-pixels', '--max-diff-ratio', '--diff-out', '--report'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--mask') {
      if (i + 1 >= argv.length) throw new UsageError('--mask precisa de x,y,w,h')
      args.masks.push(parseMask(argv[++i]))
    } else if (withValue.has(arg)) {
      if (i + 1 >= argv.length) throw new UsageError(`${arg} precisa de um valor`)
      args[arg.slice(2).replace(/^cand$/u, 'candidate')] = argv[++i]
    } else if (arg.startsWith('--')) args.flags.add(arg.slice(2))
    else throw new UsageError(`argumento inesperado: ${arg}`)
  }
  return args
}

const num = (args, name, fallback) => {
  if (args[name] === undefined) return fallback
  const value = Number(args[name])
  if (!Number.isFinite(value) || value < 0) throw new UsageError(`--${name} precisa de um número maior ou igual a zero (veio "${args[name]}")`)
  return value
}

async function main() {
  let args, baseImg, candImg, report
  try {
    args = parseArgs(process.argv.slice(2))
    if (args.base === undefined || args.candidate === undefined) throw new UsageError('uso: check-pose-register.mjs --base <png> --candidate <png> --mask x,y,w,h [--mask …]')
    const sharp = loadSharp()
    ;[baseImg, candImg] = await Promise.all([readRgba(resolve(args.base), sharp), readRgba(resolve(args.candidate), sharp)])
    const options = {
      masks: args.masks, requireChange: args.flags.has('require-change'),
      alphaThreshold: num(args, 'alpha-threshold', DEFAULTS.alphaThreshold), bboxTol: num(args, 'bbox-tol', DEFAULTS.bboxTol), centroidTol: num(args, 'centroid-tol', DEFAULTS.centroidTol),
      channelTol: num(args, 'channel-tol', DEFAULTS.channelTol), maxDiffPixels: num(args, 'max-diff-pixels', DEFAULTS.maxDiffPixels), maxDiffRatio: num(args, 'max-diff-ratio', DEFAULTS.maxDiffRatio),
    }
    report = compareRegister(baseImg, candImg, options)
    if (args['diff-out'] !== undefined && report.dimensions.base.join() === report.dimensions.cand.join()) await writeDiffPng(args['diff-out'], baseImg, candImg, args.masks, options, sharp)
  } catch (error) {
    if (error instanceof UsageError) { console.error(error.message); process.exit(2) }
    console.error(`erro: ${String(error.stack ?? error).slice(0, 500)}`); process.exit(2)
  }
  if (args.report !== undefined) writeFileSync(resolve(args.report), `${JSON.stringify({ geradoEm: new Date().toISOString(), base: baseImg.path, candidate: candImg.path, ...report }, null, 2)}\n`)
  if (!args.flags.has('quiet') || !report.ok) console.log(args.flags.has('json') ? JSON.stringify(report, null, 2) : renderText(report, { base: args.base, candidate: args.candidate, masks: args.masks }))
  process.exit(report.ok ? 0 : 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()

// PERSONAS VIVAS (Gauge 12/11, item 21): o bloco do pipeline de assets que mantém o REGISTRO IDÊNTICO entre as expressões de um mesmo animal.
// Chamado pelo build-assets.mjs (um gancho de poucas linhas); o pipeline antigo das poses não é tocado.
//
//   fonte : persona-assets/vivas/<animal>/{base,pensando,feliz,esperando,…}.png   (TODOS no mesmo canvas, o da base) + mask.json   (arquivo que começa com "_", ex. _pensando-detalhe.png, é rascunho/recorte e é ignorado)
//   saída : client/assets/vivas/<animal>-<expressao>.webp   (a base sai como <animal>-base.webp) + <animal>.json (retângulo de corte, escala, máscara já no sistema de saída)
//
// Regras (qualquer violação FALHA o build, listando todos os problemas de todos os animais, e nada é gravado):
//   1. toda expressão tem o MESMO canvas da base (largura × altura);
//   2. toda expressão passa o check-pose-register contra a base, com a máscara do animal (só o rosto pode mudar);
//   3. o corte é UM retângulo por animal: caixa do alfa da BASE + margem fixa (VIVAS_MARGIN px), nunca calculado por pose;
//   4. a escala é UMA por animal: se a altura do corte passa de VIVAS_MAX_HEIGHT, todas encolhem pela mesma escala para o mesmo tamanho exato (nunca cada uma por si).
//
// mask.json:  [x,y,w,h]  ou  [[x,y,w,h], …]  (forma curta)  ou  { "mask": [x,y,w,h] }  ou  { "masks": [[x,y,w,h], …] }  (também aceita {x,y,w,h}; BOM ok); coordenadas no canvas da FONTE.
//   opcional: "expressions": { "pensando": { "masks": [[x,y,w,h]] } }   → áreas EXTRAS só daquela expressão (ex.: a pata que sobe)
//   opcional: "tolerance": { "maxDiffPixels": N, "maxDiffRatio": R, "channelTol": N, "bboxTol": PX, "centroidTol": PX }   (padrão: tudo 0 / 1 px / 0,5 px)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { alphaStats, compareRegister, DEFAULTS as REGISTER_DEFAULTS, readRgba, UsageError } from './check-pose-register.mjs'

export const VIVAS_MARGIN = 8
export const VIVAS_MAX_HEIGHT = 480
export const VIVAS_QUALITY = 80
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const TOLERANCE_KEYS = ['maxDiffPixels', 'maxDiffRatio', 'channelTol', 'bboxTol', 'centroidTol']

export class VivasBuildError extends Error {
  constructor(problems) {
    super(`personas vivas: ${problems.length} problema(s):\n- ${problems.join('\n- ')}`)
    this.name = 'VivasBuildError'
    this.problems = problems
  }
}

// ---------------------------------------------------------------- pura: corte, escala, máscara

/** O retângulo de corte do animal: caixa do alfa da BASE + margem fixa, preso ao canvas. */
export function cropRectOf(base, margin = VIVAS_MARGIN) {
  const stats = alphaStats(base)
  if (stats.bbox === null) throw new Error('a base não tem desenho (alfa vazio)')
  const left = Math.max(0, stats.bbox.x0 - margin)
  const top = Math.max(0, stats.bbox.y0 - margin)
  const right = Math.min(base.width - 1, stats.bbox.x1 + margin)
  const bottom = Math.min(base.height - 1, stats.bbox.y1 + margin)
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

/** Tamanho de saída: o mesmo para todas as expressões. scale = 1 quando não precisa encolher. */
export function targetSizeOf(crop, maxHeight = VIVAS_MAX_HEIGHT) {
  if (crop.height <= maxHeight) return { width: crop.width, height: crop.height, scale: 1 }
  const scale = maxHeight / crop.height
  return { width: Math.max(1, Math.round(crop.width * scale)), height: maxHeight, scale }
}

/** Uma máscara no sistema da saída (depois do corte e da escala), arredondando para FORA (nunca encolhe a área liberada). */
export function maskToOutput(mask, crop, scale) {
  const x0 = Math.floor((mask.x - crop.left) * scale)
  const y0 = Math.floor((mask.y - crop.top) * scale)
  const x1 = Math.ceil((mask.x + mask.w - crop.left) * scale)
  const y1 = Math.ceil((mask.y + mask.h - crop.top) * scale)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const rectOf = (value, where) => {
  const rect = Array.isArray(value) ? { x: value[0], y: value[1], w: value[2], h: value[3] } : value
  if (rect === null || typeof rect !== 'object') throw new Error(`${where}: retângulo inválido`)
  for (const key of ['x', 'y', 'w', 'h']) if (!Number.isInteger(rect[key])) throw new Error(`${where}: ${key} precisa ser inteiro (veio ${JSON.stringify(rect[key])})`)
  if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0) throw new Error(`${where}: x e y não podem ser negativos, w e h precisam ser maiores que zero`)
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h }
}
const rectsOf = (list, where) => {
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${where}: lista vazia`)
  return list.map((item, i) => rectOf(item, `${where}[${i}]`))
}

/** @returns {{ masks: {x,y,w,h}[], extra: Record<string, {x,y,w,h}[]>, tolerance: Record<string, number> }} */
export function parseMaskFile(input) {
  // Forma curta (a que a Brush entrega): [x,y,w,h] = um retângulo; [[x,y,w,h], …] = vários.
  const json = Array.isArray(input) ? (input.length === 4 && input.every(Number.isInteger) ? { mask: input } : { masks: input }) : input
  if (json === null || typeof json !== 'object') throw new Error('mask.json precisa ser um objeto ou um array de retângulos')
  const hasOne = json.mask !== undefined
  const hasMany = json.masks !== undefined
  if (hasOne === hasMany) throw new Error('mask.json precisa de "mask" (um retângulo) OU "masks" (uma lista), um dos dois')
  const masks = hasOne ? [rectOf(json.mask, 'mask')] : rectsOf(json.masks, 'masks')
  const extra = {}
  for (const [name, value] of Object.entries(json.expressions ?? {})) extra[name] = rectsOf(value?.masks, `expressions.${name}.masks`)
  const tolerance = {}
  for (const [key, value] of Object.entries(json.tolerance ?? {})) {
    if (!TOLERANCE_KEYS.includes(key)) throw new Error(`tolerance.${key}: desconhecida (use ${TOLERANCE_KEYS.join(', ')})`)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`tolerance.${key}: precisa ser um número maior ou igual a zero`)
    tolerance[key] = value
  }
  return { masks, extra, tolerance }
}

// ---------------------------------------------------------------- fase 1: validar tudo (sem gravar nada)

/** @returns {Promise<{ plan?: any, problems: string[] }>} */
async function planAnimal(dir, animal, sharp, margin) {
  const problems = []
  const at = (file) => `vivas/${animal}/${file}`
  if (!NAME.test(animal)) return { problems: [`vivas/${animal}: nome de pasta inválido (use minúsculas, números e hífen)`] }
  const files = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile())
  const pngs = files.filter((e) => extname(e.name).toLowerCase() === '.png' && !e.name.startsWith('_')).map((e) => e.name) // "_nome.png" = rascunho/detalhe: fica na pasta e fora do build
  for (const name of pngs) {
    if (!NAME.test(name.slice(0, -4)) || extname(name) !== '.png') problems.push(`${at(name)}: nome de expressão inválido (use minúsculas, números e hífen, extensão .png)`)
  }
  if (!pngs.includes('base.png')) problems.push(`${at('base.png')}: falta a imagem base (o canvas e o corte de todas as expressões saem dela)`)
  if (!files.some((e) => e.name === 'mask.json')) problems.push(`${at('mask.json')}: falta a máscara do rosto (x,y,w,h no canvas da fonte)`)
  if (problems.length > 0) return { problems }
  let mask
  try { mask = parseMaskFile(JSON.parse(readFileSync(join(dir, 'mask.json'), 'utf8').replace(/^﻿/u, ''))) } catch (error) { return { problems: [`${at('mask.json')}: ${error.message}`] } }
  const expressions = pngs.map((name) => name.slice(0, -4)).filter((name) => name !== 'base').sort()
  for (const name of Object.keys(mask.extra)) if (!expressions.includes(name)) problems.push(`${at('mask.json')}: "expressions.${name}" não tem ${name}.png`)
  let base
  try { base = await readRgba(join(dir, 'base.png'), sharp) } catch (error) { return { problems: [`${at('base.png')}: ${error.message}`] } }
  let crop
  try { crop = cropRectOf(base, margin) } catch (error) { return { problems: [`${at('base.png')}: ${error.message}`] } }
  for (const rect of mask.masks) if (rect.x + rect.w > base.width || rect.y + rect.h > base.height) problems.push(`${at('mask.json')}: a máscara ${rect.x},${rect.y},${rect.w},${rect.h} passa do canvas da base (${base.width}×${base.height})`)
  if (problems.length > 0) return { problems }
  for (const name of expressions) {
    let image
    try { image = await readRgba(join(dir, `${name}.png`), sharp) } catch (error) { problems.push(`${at(`${name}.png`)}: ${error.message}`); continue }
    if (image.width !== base.width || image.height !== base.height) { problems.push(`${at(`${name}.png`)}: canvas ${image.width}×${image.height} diferente da base ${base.width}×${base.height} (exporte a expressão no mesmo canvas da base)`); continue }
    const masks = [...mask.masks, ...(mask.extra[name] ?? [])]
    try {
      const report = compareRegister(base, image, { ...REGISTER_DEFAULTS, ...mask.tolerance, masks })
      if (!report.ok) for (const check of report.checks.filter((c) => c.ok === false)) problems.push(`${at(`${name}.png`)}: registro com a base falhou [${check.label}] ${check.detail}`)
    } catch (error) { problems.push(`${at(`${name}.png`)}: ${error instanceof UsageError || error instanceof Error ? error.message : String(error)}`) }
  }
  return { problems, plan: { animal, dir, base: { width: base.width, height: base.height }, crop, expressions, mask } }
}

// ---------------------------------------------------------------- fase 2: gravar

async function writeAnimal(plan, { out, sharp, track, ensureDir, margin, maxHeight, quality }) {
  const size = targetSizeOf(plan.crop, maxHeight)
  const vivasDir = join(out, 'vivas')
  ensureDir(vivasDir)
  const names = ['base', ...plan.expressions]
  const files = []
  for (const name of names) {
    const rel = `vivas/${plan.animal}-${name}.webp`
    const abs = join(out, rel)
    let pipeline = sharp(join(plan.dir, `${name}.png`)).extract(plan.crop)
    if (size.scale !== 1) pipeline = pipeline.resize({ width: size.width, height: size.height, fit: 'fill' })
    await pipeline.webp({ quality, alphaQuality: 100 }).toFile(abs)
    track(rel, abs)
    files.push(rel)
  }
  const register = {
    animal: plan.animal, canvas: [plan.base.width, plan.base.height], margin, crop: plan.crop, size: [size.width, size.height], scale: size.scale,
    mask: plan.mask.masks.map((m) => maskToOutput(m, plan.crop, size.scale)),
    expressions: Object.fromEntries(names.map((name) => [name, { file: `${plan.animal}-${name}.webp`, extraMask: (plan.mask.extra[name] ?? []).map((m) => maskToOutput(m, plan.crop, size.scale)) }])),
  }
  const jsonRel = `vivas/${plan.animal}.json`
  writeFileSync(join(out, jsonRel), `${JSON.stringify(register, null, 2)}\n`)
  track(jsonRel, join(out, jsonRel))
  files.push(jsonRel)
  return { animal: plan.animal, crop: plan.crop, size: [size.width, size.height], scale: size.scale, expressions: names, files }
}

/**
 * FASE 1, para chamar NO COMEÇO do build (antes de limpar a pasta de saída): valida TODOS os animais e devolve os planos. Havendo qualquer problema lança VivasBuildError: o build para
 * antes de apagar um único asset, então uma máscara torta da Brush nunca deixa a árvore sem generated-imports.ts. Sem persona-assets/vivas = { plans: [] }.
 * @param {{ src: string, sharp: any, margin?: number }} env
 */
export async function validateVivas({ src, sharp, margin = VIVAS_MARGIN }) {
  const root = join(src, 'vivas')
  if (!existsSync(root) || !statSync(root).isDirectory()) return { plans: [] }
  const animals = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  const problems = []
  const plans = []
  for (const animal of animals) {
    const result = await planAnimal(join(root, animal), animal, sharp, margin)
    problems.push(...result.problems)
    if (result.plan !== undefined) plans.push(result.plan)
  }
  if (problems.length > 0) throw new VivasBuildError(problems)
  return { plans }
}

/**
 * FASE 2 (o gancho do build-assets.mjs, depois das poses). Com `plans` (de validateVivas) só grava; sem eles valida aqui mesmo. Sem persona-assets/vivas = não faz nada.
 * @param {{ src: string, out: string, sharp: any, track: (rel: string, abs: string) => void, ensureDir?: (dir: string) => void, log?: (m: string) => void, margin?: number, maxHeight?: number, quality?: number, plans?: any[] }} env
 */
export async function buildVivas({ src, out, sharp, track, ensureDir = (dir) => mkdirSync(dir, { recursive: true }), log = () => undefined, margin = VIVAS_MARGIN, maxHeight = VIVAS_MAX_HEIGHT, quality = VIVAS_QUALITY, plans: planned }) {
  // `plans` pode ser o array de planos OU o objeto { plans } que validateVivas devolve (passar o objeto inteiro derrubou o build real depois do clean: aceita os dois).
  const plans = planned === undefined ? (await validateVivas({ src, sharp, margin })).plans : Array.isArray(planned) ? planned : planned.plans
  if (plans.length === 0) return { animals: [] }
  const built = []
  for (const plan of plans) built.push(await writeAnimal(plan, { out, sharp, track, ensureDir, margin, maxHeight, quality }))
  if (built.length > 0) log(`vivas: ${String(built.length)} animal(is), ${String(built.reduce((n, a) => n + a.expressions.length, 0))} expressões, corte único por animal`)
  return { animals: built }
}

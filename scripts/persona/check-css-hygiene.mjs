// HIGIENE DE CSS (Gauge 11/11, item 14 da COLHEITA-MUSE): as 6 regras de CSS que reprovam o pré-aceite.
//
//   node scripts/persona/check-css-hygiene.mjs                          (todo o CSS de client-ui-persona; reprova só o que NÃO está no baseline)
//   node scripts/persona/check-css-hygiene.mjs --files a.module.css …   (só esses arquivos; as definições de token valem para a árvore toda)
//   node scripts/persona/check-css-hygiene.mjs --all                    (mostra também a dívida antiga do baseline)
//   node scripts/persona/check-css-hygiene.mjs --write-baseline         (grava/encolhe o baseline: só a dívida de hoje; nunca aumenta sozinho sem --force-baseline)
// Opções: --root <pasta> · --dir <pasta de CSS> (padrão packages/persona/client-ui-persona/src) · --baseline <json> · --no-baseline · --json · --report <json> · --quiet
//
// Regras (tudo do COLHEITA-MUSE §14.3):
//   controle-altura   controle clicável (botão, chip, aba, campo, [role], ou rule com cursor:pointer) com height/min-height/block-size em px fora de 32/40/48 (14–52 px; selos só de leitura e linhas/cartões maiores ficam de fora)
//   backdrop-filter   qualquer backdrop-filter
//   token-indefinido  var(--persona-*) ou var(--control-*) sem definição em CSS nem em string de TS/TSX
//   tempo-solto       ms/s ou cubic-bezier soltos em *.module.css (só tokens de movimento; 0 e ≤ 1ms em prefers-reduced-motion passam)
//   animacao-infinita animation … infinite com nome fora da lista permitida (a bolinha de quem trabalha, o ponto de gravação do item 20)
//   texto-pequeno     font-size abaixo de 13 px (px, rem, ou var() que resolve para isso)
// Baseline: scripts/persona/css-hygiene.baseline.json guarda a dívida ANTIGA por (arquivo | regra | seletor | detalhe) → quantidade. Reprova só o que passa disso (regressão nova).
// Exceção pontual: comentário logo acima da declaração ou da regra  /* higiene-ignore: <regra> — <motivo> */  (sem motivo não vale).
// Saída: 0 = PASSOU, 1 = FALHOU, 2 = uso errado.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
export const DEFAULT_DIR = 'packages/persona/client-ui-persona/src'
export const DEFAULT_BASELINE = 'scripts/persona/css-hygiene.baseline.json'
export const RULES = ['controle-altura', 'backdrop-filter', 'token-indefinido', 'tempo-solto', 'animacao-infinita', 'texto-pequeno']
export const CONTROL_HEIGHTS = new Set([32, 40, 48])
export const MIN_FONT_PX = 13
/**
 * Animações infinitas permitidas (a Muse confirma os nomes): a bolinha de quem trabalha, o ponto de gravação do item 20 e a respiração do rosto vivo da 21 (`livingBreathe`, Quill, OK do Gauge 12/11).
 * `livingBreathe` entrou porque cumpre as 5 regras de GPU: só `[data-breathing]` (um cabeçalho por vez), só `transform` (scaleY 1 -> 1.012), `will-change` só nesse seletor, desligada em
 * `prefers-reduced-motion` (LivingPersonaFace.module.css) e pausada por `body[data-persona-ambient-paused] *` (theme/persona-base.css: `animation-play-state: paused !important`).
 */
export const ALLOWED_INFINITE = new Set(['persona-rail-pulse', 'persona-rec-pulse', 'livingBreathe'])

// ---------------------------------------------------------------- postcss (resolve mesmo com pnpm estrito)

export function loadPostcss(root = REPO_ROOT) {
  // Worktree de outro dono pode não ter node_modules: cai para o repo onde este script mora.
  for (const base of [...new Set([root, REPO_ROOT])]) {
    const require = createRequire(`${base}/package.json`)
    try { return require('postcss') } catch { /* tenta o store do pnpm */ }
    try {
      const store = `${base}/node_modules/.pnpm`
      const found = readdirSync(store).find((name) => name.startsWith('postcss@'))
      if (found !== undefined) return require(`${store}/${found}/node_modules/postcss`)
    } catch { /* próximo candidato */ }
  }
  throw new Error('postcss não encontrado (pnpm install?)')
}

// ---------------------------------------------------------------- utilitários de valor

const stripVars = (value) => { // remove var(...) inteiro (com fallback) para não achar literal de fallback
  let out = value
  for (let i = 0; i < 4; i += 1) out = out.replace(/var\([^()]*\)/gu, ' ')
  return out
}
const TIME_LITERAL = /(?<![\w.-])(\d*\.?\d+)(ms|s)(?![\w-])/gu
const px = (text) => { const m = /^\s*(-?\d*\.?\d+)px\s*$/u.exec(text); return m === null ? undefined : Number(m[1]) }

/** Resolve `var(--x)` (1 nível, usando as definições do CSS) para o texto cru; devolve o próprio valor se não achar. */
export function resolveVar(value, defs) {
  const m = /^\s*var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)\s*$/u.exec(value)
  if (m === null) return value
  return defs.get(m[1]) ?? value
}

/** Selo de exceção: comentário imediatamente antes do nó com "higiene-ignore: <regra> — <motivo>". */
function ignoredBy(node, rule) {
  const prev = node.prev()
  if (prev?.type === 'comment') {
    // A regra tem hífen ("controle-altura"): o separador do motivo exige espaço dos dois lados (" — ", " – " ou " - ").
    const m = /higiene-ignore:\s*([\w,\s-]+?)\s+[—–-]{1,2}\s+(\S.*)$/su.exec(prev.text.trim())
    if (m !== null && m[1].split(/[,\s]+/u).includes(rule) && m[2].trim() !== '') return true
  }
  // Comentário acima da REGRA vale para as declarações dela.
  return node.type === 'decl' && node.parent?.type === 'rule' ? ignoredBy(node.parent, rule) : false
}

// ---------------------------------------------------------------- definições de token

/** Coleta nomes de custom property definidos: em CSS (`--x: …`) e como string em TS/TSX (style={{ '--x': … }}). */
export function collectDefinitions({ cssFiles, sourceFiles, postcss }) {
  const defs = new Map() // nome → último valor visto (para resolver font-size etc.)
  const dynamicPrefixes = new Set()
  for (const { css } of cssFiles) {
    let root
    try { root = postcss.parse(css) } catch { continue }
    root.walkDecls(/^--/u, (decl) => { defs.set(decl.prop, decl.value) })
  }
  for (const text of sourceFiles) {
    for (const m of text.matchAll(/['"`](--(?:persona|control)-[\w-]+)['"`]/gu)) if (!defs.has(m[1])) defs.set(m[1], '')
    for (const m of text.matchAll(/['"`](--(?:persona|control)-[\w-]*)\$\{/gu)) dynamicPrefixes.add(m[1])
    for (const m of text.matchAll(/['"`](--(?:persona|control)-[\w-]*)['"`]\s*\+/gu)) dynamicPrefixes.add(m[1])
  }
  return { defs, dynamicPrefixes }
}

// ---------------------------------------------------------------- seletores

const CLICKABLE_TAG = /^(?:button|a|summary|input|select|textarea)\b/u
const CLICKABLE_ATTR = /\[role=['"]?(?:button|tab|menuitem|menuitemradio|menuitemcheckbox|option|switch|checkbox|radio|combobox)/u
const CLICKABLE_CLASS = /\.[\w-]*(?:button|btn|chip|tab|toggle|menuitem|menu-item|pill|field|input|select|switch|checkbox|radio|segment)[\w-]*/iu

/** O último "compound" (depois do último combinador) é o elemento que de fato recebe o clique. */
function lastCompound(selector) {
  const cleaned = selector.replace(/\([^()]*\)/gu, '').trim() // tira :not(...), :is(...)
  const parts = cleaned.split(/\s*[>+~]\s*|\s+/u)
  return parts[parts.length - 1] ?? ''
}
export function isClickableSelector(selector) {
  const compound = lastCompound(selector)
  if (/::?(?:before|after|placeholder|marker|-webkit-[\w-]+)/u.test(compound)) return false
  return CLICKABLE_TAG.test(compound) || CLICKABLE_ATTR.test(compound) || CLICKABLE_CLASS.test(compound)
}

// ---------------------------------------------------------------- análise de um arquivo

/** @returns {{ rule: string, file: string, line: number, selector: string, detail: string }[]} */
export function analyzeCss({ file, css, postcss, defs, dynamicPrefixes = new Set(), allowInfinite = ALLOWED_INFINITE }) {
  const out = []
  const isModule = /\.module\.css$/iu.test(file)
  let root
  try { root = postcss.parse(css, { from: file }) } catch (error) {
    return [{ rule: 'css-invalido', file, line: error.line ?? 1, selector: '', detail: String(error.reason ?? error.message).slice(0, 120) }]
  }
  const add = (rule, node, selector, detail) => { if (!ignoredBy(node, rule)) out.push({ rule, file, line: node.source?.start?.line ?? 1, selector, detail }) }
  const selectorOf = (decl) => (decl.parent?.type === 'rule' ? decl.parent.selector.replace(/\s+/gu, ' ') : decl.parent?.type === 'atrule' ? `@${decl.parent.name} ${decl.parent.params}` : '')
  const inReducedMotion = (node) => { for (let p = node.parent; p; p = p.parent) if (p.type === 'atrule' && /prefers-reduced-motion/u.test(p.params)) return true; return false }

  // controle-altura: por regra
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /^(keyframes|-webkit-keyframes)$/u.test(rule.parent.name)) return
    const selectors = rule.selector.split(',').map((s) => s.trim())
    let pointer = false
    rule.each((child) => { if (child.type === 'decl' && child.prop === 'cursor' && /pointer/u.test(child.value)) pointer = true })
    const clickable = selectors.some(isClickableSelector) || (pointer && !selectors.every((s) => /::?(?:before|after)/u.test(s)))
    if (!clickable) return
    rule.each((decl) => {
      if (decl.type !== 'decl' || !/^(height|min-height|block-size|min-block-size)$/u.test(decl.prop)) return
      const resolved = resolveVar(decl.value, defs)
      const value = px(/^var\(--control-h-[sml]/u.test(decl.value.trim()) ? '40px' : resolved)
      // 14–52 px: abaixo disso é filete/ponto; acima é linha de lista ou cartão clicável, não "controle" da régua.
      if (value === undefined || value < 14 || value > 52 || CONTROL_HEIGHTS.has(value)) return
      add('controle-altura', decl, rule.selector.replace(/\s+/gu, ' '), `${decl.prop}: ${decl.value} (use 32, 40 ou 48; selo só de leitura não tem cursor:pointer nem nome de controle)`)
    })
  })

  root.walkDecls((decl) => {
    const selector = selectorOf(decl)
    const value = decl.value
    // backdrop-filter
    if (/^(-webkit-)?backdrop-filter$/u.test(decl.prop) && !/^\s*(none|unset|initial|inherit)\s*$/u.test(value)) add('backdrop-filter', decl, selector, `${decl.prop}: ${value}`)
    // token-indefinido
    for (const m of value.matchAll(/var\(\s*(--(?:persona|control)-[\w-]+)/gu)) {
      const name = m[1]
      if (defs.has(name) || [...dynamicPrefixes].some((prefix) => name.startsWith(prefix))) continue
      add('token-indefinido', decl, selector, name)
    }
    // tempo-solto
    if (isModule && /^(transition|transition-(duration|delay|timing-function)|animation|animation-(duration|delay|timing-function))$/u.test(decl.prop)) {
      const bare = stripVars(value)
      const reduced = inReducedMotion(decl)
      const literals = [...bare.matchAll(TIME_LITERAL)].filter((m) => {
        const ms = Number(m[1]) * (m[2] === 's' ? 1000 : 1)
        return !(ms === 0 || (reduced && ms <= 1))
      })
      if (literals.length > 0) add('tempo-solto', decl, selector, `${decl.prop}: ${value} (use os tokens de movimento)`)
      else if (/cubic-bezier\(/u.test(bare)) add('tempo-solto', decl, selector, `${decl.prop}: ${value} (cubic-bezier solto)`)
    }
    // animacao-infinita
    if (/^animation(-iteration-count)?$/u.test(decl.prop) && /(?<![\w-])infinite(?![\w-])/u.test(value)) {
      const names = value.split(/[\s,]+/u).filter((token) => /^[A-Za-z_][\w-]*$/u.test(token))
      if (!names.some((name) => allowInfinite.has(name))) add('animacao-infinita', decl, selector, `${decl.prop}: ${value}`)
    }
    // texto-pequeno
    if (decl.prop === 'font-size' || decl.prop === 'font') {
      const text = decl.prop === 'font' ? (/(?:^|\s)(\d*\.?\d+(?:px|rem))(?:\/|\s)/u.exec(value)?.[1] ?? '') : resolveVar(value, defs).trim()
      const m = /^(\d*\.?\d+)(px|rem)$/u.exec(text)
      if (m !== null) {
        const size = m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16
        if (size > 0 && size < MIN_FONT_PX) add('texto-pequeno', decl, selector, `${decl.prop}: ${value}${text === value.trim() ? '' : ` → ${text}`} (mínimo ${MIN_FONT_PX}px)`)
      }
    }
  })
  return out
}

export const keyOf = (v) => `${v.file}|${v.rule}|${v.selector}|${v.detail}`

/** Separa o que é dívida antiga (coberta pelo baseline, por quantidade) do que é novo. */
export function applyBaseline(violations, baseline) {
  const budget = new Map(Object.entries(baseline ?? {}))
  const fresh = []
  const old = []
  for (const v of violations) {
    const key = keyOf(v)
    const left = budget.get(key) ?? 0
    if (left > 0) { budget.set(key, left - 1); old.push(v) } else fresh.push(v)
  }
  const fixed = [...budget.values()].reduce((sum, n) => sum + n, 0) // dívida que sumiu: o baseline pode encolher
  return { fresh, old, fixed }
}
export function baselineFrom(violations) {
  const entries = {}
  for (const v of violations) entries[keyOf(v)] = (entries[keyOf(v)] ?? 0) + 1
  return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)))
}

// ---------------------------------------------------------------- varredura de pastas

function* walk(dir, test) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== 'dist') yield* walk(path, test) } else if (test(entry.name)) yield path
  }
}
const read = (path) => readFileSync(path, 'utf8').replace(/^﻿/u, '')

/** @param {{ root?: string, dir?: string, files?: string[], baseline?: Record<string, number>|null, postcss?: any }} options */
export function runCheck(options = {}) {
  const root = resolve(options.root ?? REPO_ROOT)
  const dir = resolve(root, options.dir ?? DEFAULT_DIR)
  const postcss = options.postcss ?? loadPostcss(root)
  const allCss = [...walk(dir, (name) => name.endsWith('.css'))].map((path) => ({ path, rel: relative(root, path).replaceAll(sep, '/'), css: read(path) }))
  const sources = [...walk(dir, (name) => /\.(ts|tsx)$/u.test(name))].map(read)
  const { defs, dynamicPrefixes } = collectDefinitions({ cssFiles: allCss, sourceFiles: sources, postcss })
  const wanted = options.files === undefined || options.files.length === 0 ? undefined : new Set(options.files.map((f) => relative(root, resolve(root, f)).replaceAll(sep, '/')))
  const violations = []
  for (const { rel, css } of allCss) {
    if (wanted !== undefined && !wanted.has(rel)) continue
    violations.push(...analyzeCss({ file: rel, css, postcss, defs, dynamicPrefixes }))
  }
  const { fresh, old, fixed } = applyBaseline(violations, options.baseline ?? undefined)
  const useBaseline = options.baseline !== null && options.baseline !== undefined
  return { ok: (useBaseline ? fresh : violations).length === 0, violations: useBaseline ? fresh : violations, old: useBaseline ? old : [], fixed: useBaseline ? fixed : 0, all: violations, stats: { arquivos: wanted === undefined ? allCss.length : wanted.size, definicoes: defs.size } }
}

export function renderText(result, { showOld = false } = {}) {
  const lines = []
  const put = (v, label) => lines.push(`${label} [${v.rule}] ${v.file}:${v.line}${v.selector === '' ? '' : ` ${v.selector}`} — ${v.detail}`)
  for (const v of result.violations) put(v, 'FALHOU')
  if (showOld) for (const v of result.old) put(v, 'dívida antiga')
  const byRule = RULES.map((rule) => `${rule} ${result.all.filter((v) => v.rule === rule).length}`).join(' · ')
  lines.push(`${result.ok ? 'PASSOU' : 'FALHOU'} — higiene de CSS: ${result.stats.arquivos} arquivo(s), ${result.violations.length} novo(s), ${result.old.length} de dívida antiga no baseline${result.fixed > 0 ? ` (${result.fixed} já corrigido(s): rode --write-baseline para encolher)` : ''}. Totais por regra: ${byRule}.`)
  return lines.join('\n')
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const args = { files: [], flags: new Set() }
  const withValue = new Set(['--root', '--dir', '--baseline', '--report'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--files') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.files.push(argv[++i]) } else if (withValue.has(arg)) {
      if (i + 1 >= argv.length) throw new Error(`${arg} precisa de um valor`)
      args[arg.slice(2)] = argv[++i]
    } else if (arg.startsWith('--')) args.flags.add(arg.slice(2))
    else throw new Error(`argumento inesperado: ${arg}`)
  }
  return args
}

function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) } catch (error) { console.error(`uso: ${error.message}`); process.exit(2) }
  const root = resolve(args.root ?? REPO_ROOT)
  const baselinePath = isAbsolute(args.baseline ?? '') ? args.baseline : resolve(root, args.baseline ?? DEFAULT_BASELINE)
  const noBaseline = args.flags.has('no-baseline') || args.flags.has('write-baseline')
  let baseline = null
  if (!noBaseline && existsSync(baselinePath)) { try { baseline = JSON.parse(read(baselinePath)).entries ?? {} } catch { console.error(`baseline ilegível: ${baselinePath}`); process.exit(2) } }
  let result
  try { result = runCheck({ root, dir: args.dir, files: args.files, baseline }) } catch (error) { console.error(`erro ao checar: ${error.message}`); process.exit(2) }
  if (args.flags.has('write-baseline')) {
    const next = baselineFrom(result.all)
    const previous = existsSync(baselinePath) ? (JSON.parse(read(baselinePath)).entries ?? {}) : undefined
    const grows = previous !== undefined && Object.entries(next).some(([key, n]) => n > (previous[key] ?? 0))
    if (grows && !args.flags.has('force-baseline')) { console.error('o baseline só pode ENCOLHER: há violação nova (use --force-baseline só com OK do Atlas)'); process.exit(1) }
    mkdirSync(dirname(baselinePath), { recursive: true })
    writeFileSync(baselinePath, `${JSON.stringify({ aviso: 'Dívida ANTIGA de CSS (Gauge). Só encolhe. Não adicione entradas à mão.', geradoEm: new Date().toISOString(), entries: next }, null, 1)}\n`)
    console.log(`baseline gravado: ${Object.keys(next).length} entradas, ${result.all.length} violações antigas → ${relative(root, baselinePath)}`)
    process.exit(0)
  }
  if (args.report !== undefined) writeFileSync(resolve(args.report), `${JSON.stringify({ geradoEm: new Date().toISOString(), ...result }, null, 2)}\n`)
  if (!args.flags.has('quiet') || !result.ok) console.log(args.flags.has('json') ? JSON.stringify(result, null, 2) : renderText(result, { showOld: args.flags.has('all') }))
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()

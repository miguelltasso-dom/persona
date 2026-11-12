#!/usr/bin/env node
// FECHO DE IMPORTAÇÕES DO HEAD (Gauge, a pedido do Keel 12/11): o persona-gate valida a ÁRVORE DE TRABALHO, mas o que se publica é o COMMIT. Um arquivo novo que ficou sem `git add`
// (indicators/IndicatorNotices.tsx, spotlight-indicator.ts, persona-sync/invite-link.ts) faz a árvore compilar e o HEAD publicado quebrar. Este script olha SÓ o HEAD: todo import relativo
// de um arquivo de código do HEAD precisa resolver para um arquivo que também está no HEAD.
//
//   node scripts/persona/check-head-closure.mjs                 (HEAD)
//   node scripts/persona/check-head-closure.mjs --ref <commit>  (qualquer commit/tag/branch)
//   node scripts/persona/check-head-closure.mjs --json          (saída em JSON)
//   node scripts/persona/check-head-closure.mjs --scope a/,b/   (só esses prefixos; padrão: packages/persona/, apps/desktop/, scripts/persona/) · --all (o monorepo inteiro, com o ruído do fork)
//   node scripts/persona/check-head-closure.mjs --baseline <arquivo.json>   (padrão: scripts/persona/check-head-closure.baseline.json, se existir)
//
// Escopo: TODOS os arquivos .ts/.tsx/.mts/.cts/.js/.jsx/.mjs/.cjs/.css do produto no commit (não só os que mudaram: apagar o alvo de um import antigo também quebra o fecho). O alvo pode estar em qualquer lugar do commit.
// O que conta como import: `import … from './x'`, `export … from './x'`, `import './x'`, `import('./x')`, `require('./x')` e `@import './x'` em CSS. Comentários não contam; template strings
// (`./${nome}.png`, dinâmicas) são ignoradas de propósito (o build-assets monta caminhos assim); só aspas simples ou duplas.
// Resolução (como o TypeScript/bundler): o caminho exato, as extensões de código/json/css, `/index.*`, e `.js`→`.ts`/`.tsx`, `.mjs`→`.mts`, `.cjs`→`.cts`, `.jsx`→`.tsx`. `?raw`/`?url`/`#x` são cortados.
// Baseline: { "known": ["arquivo -> './spec'"] } para o que NÃO resolve de propósito (gerado em build, por exemplo), cada um com motivo em "why".
// Saída: 0 = fecha, 1 = import sem alvo no commit, 2 = uso errado / ref inexistente.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

export const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|css)$/u
const TRY_EXTS = ['', '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '/index.ts', '/index.tsx', '/index.js', '/index.mjs', '/index.json']
const JS_TO_TS = [['.js', ['.ts', '.tsx']], ['.jsx', ['.tsx']], ['.mjs', ['.mts']], ['.cjs', ['.cts']]]

/** Caminho posix normalizado (`a/b/../c` → `a/c`); `undefined` quando sobe acima da raiz. */
export function normalizePath(path) {
  const out = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') { if (out.length === 0) return undefined; out.pop() } else out.push(part)
  }
  return out.join('/')
}

/**
 * Esqueleto do código: comentários viram espaços e cada literal de string vira um marcador (`'§n'`, `"§n"` ou `` `§n` ``); `strings[n]` guarda o texto cru. Assim `from './x'` só é achado em CÓDIGO:
 * o que está dentro de uma string ou template (a fixture de um teste que ESCREVE um arquivo com imports) e dentro de comentário nunca conta. As quebras de linha são mantidas (o número da linha vale).
 * Um regex literal com aspas dentro pode enganar o leitor numa linha: o pior caso é PERDER um import (nunca inventar um).
 */
export function skeletonOf(text) {
  let out = ''
  const strings = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') { out += ' '; i += 1 }
    } else if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2)
      const stop = end < 0 ? text.length : end + 2
      for (; i < stop; i += 1) out += text[i] === '\n' ? '\n' : ' '
    } else if (ch === '\'' || ch === '"' || ch === '`') {
      let j = i + 1
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === ch || (text[j] === '\n' && ch !== '`')) break
        j += 1
      }
      const body = text.slice(i + 1, Math.min(j, text.length))
      strings.push(body)
      out += `${ch}§${String(strings.length - 1)}${ch}${'\n'.repeat(body.split('\n').length - 1)}`
      i = text[j] === ch ? j + 1 : j
    } else { out += ch; i += 1 }
  }
  return { code: out, strings }
}

const JS_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])§(\d+)\1/gu
const CSS_IMPORT = /@import\s+(?:url\(\s*)?(['"])(\.{1,2}\/[^'"\n]*)\1/gu
const stripCssComments = (text) => text.replace(/\/\*[\s\S]*?\*\//gu, (block) => block.replace(/[^\n]/gu, ' '))

/** Imports relativos de um arquivo: [{ spec, line }]. */
export function importsOf(text, file) {
  const found = []
  if (file.endsWith('.css')) {
    const clean = stripCssComments(text)
    for (const match of clean.matchAll(CSS_IMPORT)) found.push({ spec: match[2], line: clean.slice(0, match.index).split('\n').length })
    return found
  }
  const { code, strings } = skeletonOf(text)
  for (const match of code.matchAll(JS_IMPORT)) {
    const spec = strings[Number(match[2])]
    if (spec !== undefined && /^\.{1,2}\//u.test(spec)) found.push({ spec, line: code.slice(0, match.index).split('\n').length })
  }
  return found
}

/** Saída de build: `lib/` (tipos e JS gerados) nunca está no git; um import que cai nela é do build, não do commit. */
export const BUILD_OUTPUT = /(?:^|\/)lib\//u
/** Arquivos que não moram onde estão: o overlay do empacotamento é COPIADO para dentro de um pacote, e os imports dele valem lá. */
export const NOT_IN_PLACE = [/^scripts\/persona\/pack-overlay\//u]

/** O arquivo do conjunto `tree` para o qual `spec` aponta a partir de `file`, ou `undefined`. */
export function resolveImport(tree, file, spec) {
  const clean = spec.replace(/[?#].*$/u, '')
  const target = normalizePath(`${dirname(file) === '.' ? '' : dirname(file)}/${clean}`)
  if (target === undefined) return undefined
  const bases = [target]
  for (const [from, tos] of JS_TO_TS) if (target.endsWith(from)) for (const to of tos) bases.push(`${target.slice(0, -from.length)}${to}`)
  for (const base of bases) for (const ext of TRY_EXTS) if (tree.has(`${base}${ext}`)) return `${base}${ext}`
  return undefined
}

function git(args, options = {}) {
  return spawnSync('git', ['-C', options.root ?? REPO_ROOT, '-c', 'core.quotepath=false', ...args], { ...(options.binary === true ? {} : { encoding: 'utf8' }), maxBuffer: 1 << 30, input: options.input })
}

/** Arquivos do commit: [{ path, sha }] (só os de código); `tree` com TODOS os caminhos. */
export function listTree(ref, root) {
  const result = git(['ls-tree', '-r', '-z', ref], { root })
  if (result.status !== 0) throw new Error(`git ls-tree ${ref}: ${String(result.stderr).trim() || `exit ${String(result.status)}`}`)
  const tree = new Set()
  const sources = []
  for (const entry of result.stdout.split('\0')) {
    const match = /^(\d+) (\w+) ([0-9a-f]+)\t(.+)$/su.exec(entry)
    if (match === null || match[2] !== 'blob') continue
    tree.add(match[4])
    if (SOURCE_EXT.test(match[4])) sources.push({ path: match[4], sha: match[3] })
  }
  return { tree, sources }
}

/** Conteúdo dos blobs numa chamada só (`git cat-file --batch`): Map sha → texto. */
export function readBlobs(shas, root) {
  const unique = [...new Set(shas)]
  const result = git(['cat-file', '--batch'], { root, binary: true, input: `${unique.join('\n')}\n` })
  if (result.status !== 0) throw new Error(`git cat-file: ${String(result.stderr).trim()}`)
  const buffer = result.stdout
  const blobs = new Map()
  let offset = 0
  while (offset < buffer.length) {
    const eol = buffer.indexOf(10, offset)
    if (eol < 0) break
    const [sha, type, size] = buffer.subarray(offset, eol).toString('utf8').split(' ')
    if (type === 'missing') { offset = eol + 1; continue }
    const length = Number(size)
    blobs.set(sha, buffer.subarray(eol + 1, eol + 1 + length).toString('utf8'))
    offset = eol + 1 + length + 1
  }
  return blobs
}

/** Onde o produto mora: o resto do monorepo é o fork (fixtures de teste, saídas de build) e fica de fora, a não ser com `--all`. */
export const DEFAULT_SCOPES = ['packages/persona/', 'apps/desktop/', 'scripts/persona/']

/**
 * @param {{ ref?: string, root?: string, known?: Iterable<string>, scopes?: readonly string[] | 'all' }} options
 * @returns {{ ok: boolean, ref: string, commit: string, files: number, imports: number, unresolved: { file: string, spec: string, line: number }[], knownHit: number }}
 */
export function checkHeadClosure(options = {}) {
  const root = options.root ?? REPO_ROOT
  const ref = options.ref ?? 'HEAD'
  const parsed = git(['rev-parse', '--verify', `${ref}^{commit}`], { root })
  if (parsed.status !== 0) throw new Error(`ref inexistente: ${ref}`)
  return closureOfTreeish(ref, { ...options, root, label: ref, commit: String(parsed.stdout).trim().slice(0, 10), subject: 'commit' })
}

/**
 * A regra do fecho sobre QUALQUER árvore do git (commit, ou uma árvore ainda sem commit: `git write-tree`): é o que `check-tree-closure.mjs` usa. Mesma regra, mesma saída.
 * @param {string} treeish - O que o `git ls-tree` entende (commit ou árvore).
 * @param {{ root?: string, known?: Iterable<string>, scopes?: readonly string[] | 'all', label?: string, commit?: string, subject?: 'commit' | 'árvore' }} options
 */
export function closureOfTreeish(treeish, options = {}) {
  const root = options.root ?? REPO_ROOT
  const ref = options.label ?? treeish
  const known = new Set(options.known ?? [])
  const scopes = options.scopes ?? DEFAULT_SCOPES
  const listed = listTree(treeish, root)
  const { tree } = listed
  const sources = scopes === 'all' ? listed.sources : listed.sources.filter((item) => scopes.some((scope) => item.path.startsWith(scope)))
  const blobs = readBlobs(sources.map((item) => item.sha), root)
  const unresolved = []
  let imports = 0
  let knownHit = 0
  for (const { path, sha } of sources) {
    const text = blobs.get(sha)
    if (text === undefined || NOT_IN_PLACE.some((re) => re.test(path))) continue
    for (const { spec, line } of importsOf(text, path)) {
      imports += 1
      if (resolveImport(tree, path, spec) !== undefined) continue
      if (BUILD_OUTPUT.test(normalizePath(`${dirname(path) === '.' ? '' : dirname(path)}/${spec.replace(/[?#].*$/u, '')}`) ?? '')) continue // gerado pelo build
      if (known.has(`${path} -> ${spec}`)) { knownHit += 1; continue }
      unresolved.push({ file: path, spec, line })
    }
  }
  return { ok: unresolved.length === 0, ref, commit: options.commit ?? treeish.slice(0, 10), subject: options.subject ?? 'commit', files: sources.length, imports, unresolved, knownHit }
}

export function renderText(result) {
  const where = result.subject === 'árvore' ? 'na árvore' : 'no commit'
  const lines = result.unresolved.map((item) => `FALHOU ${item.file}:${String(item.line)} — import '${item.spec}' não existe ${where} (arquivo novo sem git add, ou apagado?)`)
  lines.push(`${result.ok ? 'PASSOU' : 'FALHOU'} — fecho de importações de ${result.ref} (${result.commit}): ${String(result.files)} arquivo(s), ${String(result.imports)} import(s) relativo(s), ${String(result.unresolved.length)} sem alvo${result.knownHit > 0 ? `, ${String(result.knownHit)} conhecido(s) pelo baseline` : ''}.`)
  return lines.join('\n')
}

function loadKnown(path) {
  if (path === undefined || !existsSync(path)) return []
  try { return (JSON.parse(readFileSync(path, 'utf8')).known ?? []).filter((item) => typeof item === 'string') } catch { return [] }
}

function main() {
  const argv = process.argv.slice(2)
  const flags = new Set()
  const values = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--ref' || argv[i] === '--baseline' || argv[i] === '--root' || argv[i] === '--scope') { if (i + 1 >= argv.length) { console.error(`uso: ${argv[i]} precisa de um valor`); process.exit(2) } values[argv[i].slice(2)] = argv[++i] } else if (argv[i].startsWith('--')) flags.add(argv[i].slice(2))
    else { console.error(`uso: argumento inesperado ${argv[i]}`); process.exit(2) }
  }
  const baseline = values.baseline === undefined ? resolve(HERE, 'check-head-closure.baseline.json') : resolve(values.baseline)
  let result
  const scopes = flags.has('all') ? 'all' : values.scope === undefined ? undefined : values.scope.split(',').map((item) => (item.endsWith('/') ? item : `${item}/`))
  try { result = checkHeadClosure({ ref: values.ref, root: values.root === undefined ? undefined : resolve(values.root), known: loadKnown(baseline), scopes }) } catch (error) { console.error(`erro: ${error.message}`); process.exit(2) }
  console.log(flags.has('json') ? JSON.stringify(result, null, 2) : renderText(result))
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()

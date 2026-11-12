#!/usr/bin/env node
// LINT COMO O HOOK (Gauge 12/11, pedido do Keel): roda o oxlint com .oxlintrc.staged.json nos arquivos que o pré-commit olharia e IMPRIME os erros.
// O hook (lefthook.yml "lint (staged)") usa run-oxlint.ts --fix e só vê o que está em stage; o run-oxlint sob with-lock não imprime o erro. Este script chama o binário do oxlint direto
// e mostra arquivo:linha:coluna + regra, para entrar no pré-aceite do Ember: um commit não pode nascer com dívida de lint.
//
//   node scripts/persona/check-lint-staged.mjs                  (arquivos alterados em relação ao HEAD + novos, staged ou não)
//   node scripts/persona/check-lint-staged.mjs --staged         (só o index: exatamente o que o hook veria)
//   node scripts/persona/check-lint-staged.mjs --base <ref>     (tudo que difere de <ref>)   ·   --files a.ts b.tsx  (só esses; aceita pasta)
// Opções: --root <pasta> (worktree de outro dono) · --config <json> (padrão .oxlintrc.staged.json) · --oxlint <bin> · --no-ignore (repassa ao oxlint). Arquivo passado em --files é lintado mesmo estando no .gitignore (o staging em .maestri/ funciona sem isto); ignorePatterns do config continuam valendo
//         --fix (aplica as correções automáticas e mostra o que sobrou: EDITA arquivos, não use durante congelamento) · --json · --report <json> · --quiet
// Mesmo recorte do hook: *.{ts,tsx,mts,cts,mjs}, fora de vendor/*/src/**, só arquivos que existem; MAIS: *.d.ts (emit gerado que nunca vai ao stage) fica de fora, `--include-dts` traz de volta.
// Erro reprova (exit 1); aviso só conta. Exit 2 = uso errado / oxlint não achado ou quebrou.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
export const LINT_GLOB = /\.(?:ts|tsx|mts|cts|mjs)$/u
export const LINT_EXCLUDE = /^vendor\/[^/]+\/src\//u
/** `spawn` direto (sem cmd.exe) aceita até ~32 mil caracteres no Windows; lotes de 24 mil deixam folga para o node, o config e as flags. (O limite de 8191 é do cmd.exe.) */
export const MAX_ARGS_CHARS = 24_000

export class UsageError extends Error {}

// ---------------------------------------------------------------- arquivos

/** Declarações (`*.d.ts`) são EMIT gerado (typert/tsc: ex. packages/credentials/credentials/src/index.d.ts) e nunca vão ao stage: ficam fora por padrão (`--include-dts` as traz de volta). */
export const GENERATED_DTS = /\.d\.[mc]?ts$/u

export const isLintable = (path, { dts = false } = {}) => LINT_GLOB.test(path) && !LINT_EXCLUDE.test(path.replaceAll('\\', '/')) && (dts || !GENERATED_DTS.test(path))

function git(root, args) {
  return execFileSync('git', ['-C', root, '-c', 'core.quotepath=false', ...args], { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
}
const lines = (text) => text.split('\0').filter(Boolean)

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

/** Arquivos a lintar (caminhos relativos com "/"): só os que existem e batem com o glob do hook. */
export function collectFiles({ root, base = 'HEAD', staged = false, files, includeDts = false }) {
  let names
  if (files !== undefined && files.length > 0) {
    names = []
    for (const file of files) {
      const abs = resolve(root, file)
      if (!existsSync(abs)) throw new UsageError(`arquivo/pasta não existe: ${file}`)
      for (const path of statSync(abs).isDirectory() ? walk(abs) : [abs]) names.push(relative(root, path).replaceAll(sep, '/'))
    }
  } else if (staged) {
    names = lines(git(root, ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']))
  } else {
    names = [
      ...lines(git(root, ['diff', '--name-only', '--diff-filter=ACMR', '-z', base, '--'])),
      ...lines(git(root, ['ls-files', '--others', '--exclude-standard', '-z'])),
    ]
  }
  return [...new Set(names.map((name) => name.replaceAll('\\', '/')))].filter((name) => isLintable(name, { dts: includeDts }) && existsSync(join(root, name))).sort()
}

/** Divide a lista em lotes cuja linha de comando cabe no limite. */
export function batchesOf(files, maxChars = MAX_ARGS_CHARS) {
  const batches = []
  let current = []
  let size = 0
  for (const file of files) {
    if (current.length > 0 && size + file.length + 1 > maxChars) { batches.push(current); current = []; size = 0 }
    current.push(file)
    size += file.length + 1
  }
  if (current.length > 0) batches.push(current)
  return batches
}

// ---------------------------------------------------------------- saída do oxlint (--format=unix)

const UNIX_LINE = /^(.+?):(\d+):(\d+): (.*) \[(Error|Warning)\/(.+)\]$/u

/** @returns {{ file: string, line: number, column: number, message: string, severity: 'erro'|'aviso', rule: string }[]} */
export function parseUnix(output) {
  const problems = []
  for (const raw of output.split(/\r?\n/u)) {
    const m = UNIX_LINE.exec(raw.trim())
    if (m === null) continue
    problems.push({ file: m[1].replaceAll('\\', '/'), line: Number(m[2]), column: Number(m[3]), message: m[4], severity: m[5] === 'Error' ? 'erro' : 'aviso', rule: m[6] })
  }
  return problems
}

// ---------------------------------------------------------------- execução

export function runLint({ root, files, config = '.oxlintrc.staged.json', oxlint, fix = false, noIgnore = false }) {
  const bin = oxlint ?? join(root, 'node_modules', 'oxlint', 'bin', 'oxlint')
  const fallback = join(REPO_ROOT, 'node_modules', 'oxlint', 'bin', 'oxlint') // worktree de outro dono sem node_modules
  const cli = existsSync(bin) ? bin : existsSync(fallback) ? fallback : undefined
  if (cli === undefined) throw new UsageError('oxlint não encontrado (pnpm install?)')
  const configPath = existsSync(resolve(root, config)) ? resolve(root, config) : resolve(REPO_ROOT, config)
  if (!existsSync(configPath)) throw new UsageError(`config do oxlint não existe: ${config}`)
  const problems = []
  for (const batch of batchesOf(files)) {
    const args = [cli, '--config', configPath, '--format=unix', ...(fix ? ['--fix'] : []), ...(noIgnore ? ['--no-ignore'] : []), '--no-error-on-unmatched-pattern', ...batch]
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    if (result.error !== undefined) throw new UsageError(`não consegui rodar o oxlint: ${result.error.message}`)
    const parsed = parseUnix(result.stdout)
    // status 0 = limpo, 1 = achou problemas; qualquer outro valor é o oxlint quebrando (ou config inválida)
    if (result.status !== 0 && result.status !== 1) throw new UsageError(`o oxlint saiu com ${String(result.status)}: ${(result.stderr || result.stdout).trim().slice(0, 300)}`)
    if (result.status === 1 && parsed.length === 0) throw new UsageError(`o oxlint falhou sem listar problemas: ${(result.stderr || result.stdout).trim().slice(0, 300)}`)
    problems.push(...parsed)
  }
  return problems
}

/** O que o baseline guarda: { file: { rule: quantos erros hoje } } (só ERROS; sem número de linha, para não quebrar quando alguém edita o arquivo). */
export function baselineOf(problems) {
  const out = {}
  for (const p of problems) if (p.severity === 'erro') { out[p.file] = out[p.file] ?? {}; out[p.file][p.rule] = (out[p.file][p.rule] ?? 0) + 1 }
  return out
}

/**
 * RATCHET (Gauge, Carbon P2-01): a dívida de hoje é perdoada ATÉ o número que o baseline guarda por arquivo e regra; um erro a mais do que isso é NOVO e reprova. O número só pode descer
 * (regere o baseline depois de pagar). Separa `fresh` (reprova) de `known` (dívida conhecida, só conta).
 */
export function applyBaseline(problems, allow) {
  const left = {}
  for (const [file, rules] of Object.entries(allow ?? {})) left[file] = { ...rules }
  const fresh = []
  const known = []
  for (const p of problems) {
    if (p.severity !== 'erro') { fresh.push(p); continue }
    const room = left[p.file]?.[p.rule] ?? 0
    if (room > 0) { left[p.file][p.rule] = room - 1; known.push(p) } else fresh.push(p)
  }
  return { fresh, known }
}

export function summarize(files, problems, allow) {
  const { fresh, known } = allow === undefined ? { fresh: problems, known: [] } : applyBaseline(problems, allow)
  const errors = fresh.filter((p) => p.severity === 'erro')
  const warnings = fresh.filter((p) => p.severity === 'aviso')
  const byFile = {}
  for (const p of errors) byFile[p.file] = (byFile[p.file] ?? 0) + 1
  return { ok: errors.length === 0, files: files.length, errors: errors.length, warnings: warnings.length, known: known.length, problems: fresh, byFile }
}

export function renderText(result) {
  const out = []
  for (const p of result.problems) out.push(`${p.severity === 'erro' ? 'FALHOU' : 'aviso'} [lint] ${p.file}:${p.line}:${p.column} — ${p.message} [${p.rule}]`)
  const perFile = Object.entries(result.byFile).sort((a, b) => b[1] - a[1])
  if (perFile.length > 0) out.push(`por arquivo: ${perFile.map(([f, n]) => `${f} (${n})`).join(', ')}`)
  out.push(`${result.ok ? 'PASSOU' : 'FALHOU'} — lint (staged): ${result.files} arquivo(s), ${result.errors} erro(s), ${result.warnings} aviso(s)${result.known > 0 ? `, ${result.known} da dívida conhecida (baseline: só pode descer)` : ''}.`)
  return out.join('\n')
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const args = { files: [], flags: new Set() }
  const withValue = new Set(['--root', '--base', '--config', '--oxlint', '--report', '--baseline', '--write-baseline'])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--files') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.files.push(argv[++i]) } else if (withValue.has(arg)) {
      if (i + 1 >= argv.length) throw new UsageError(`${arg} precisa de um valor`)
      args[arg.slice(2)] = argv[++i]
    } else if (arg.startsWith('--')) args.flags.add(arg.slice(2))
    else throw new UsageError(`argumento inesperado: ${arg}`)
  }
  return args
}

function main() {
  let args, result
  try {
    args = parseArgs(process.argv.slice(2))
    const root = resolve(args.root ?? REPO_ROOT)
    const files = collectFiles({ root, base: args.base, staged: args.flags.has('staged'), files: args.files, includeDts: args.flags.has('include-dts') })
    const problems = files.length === 0 ? [] : runLint({ root, files, config: args.config, oxlint: args.oxlint, fix: args.flags.has('fix'), noIgnore: args.flags.has('no-ignore') })
    if (args['write-baseline'] !== undefined) {
      writeFileSync(resolve(args['write-baseline']), `${JSON.stringify({ geradoEm: new Date().toISOString(), why: 'Dívida de lint conhecida (Carbon P2-01): o gate perdoa ATÉ estes números por arquivo e regra; erro a mais é novo e reprova. Só pode descer: regere depois de pagar.', allow: baselineOf(problems) }, null, 2)}\n`)
      console.log(`baseline gravado: ${String(problems.filter((p) => p.severity === 'erro').length)} erro(s) em ${String(Object.keys(baselineOf(problems)).length)} arquivo(s)`)
    }
    if (args.baseline !== undefined && !existsSync(resolve(args.baseline))) throw new UsageError(`baseline não existe: ${args.baseline}`)
    const allow = args.baseline === undefined ? undefined : JSON.parse(readFileSync(resolve(args.baseline), 'utf8')).allow ?? {}
    result = summarize(files, problems, allow)
  } catch (error) {
    console.error(error instanceof UsageError ? error.message : `erro ao checar: ${String(error.message ?? error).slice(0, 300)}`)
    process.exit(2)
  }
  if (args.report !== undefined) writeFileSync(resolve(args.report), `${JSON.stringify({ geradoEm: new Date().toISOString(), ...result }, null, 2)}\n`)
  if (!args.flags.has('quiet') || !result.ok) console.log(args.flags.has('json') ? JSON.stringify(result, null, 2) : renderText(result))
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()

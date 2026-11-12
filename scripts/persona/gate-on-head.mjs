#!/usr/bin/env node
// GATE CONTRA UM WORKTREE LIMPO DO COMMIT (Gauge, a pedido do Keel 12/11): o persona-gate valida a ÁRVORE DE TRABALHO (com o WIP de todos), mas o que se publica é o COMMIT. Este script faz um
// `git worktree` do commit (só o que está no git), religa os node_modules nele e roda o gate LÁ. Um arquivo novo sem `git add`, um import que só existe na árvore, um tipo gerado que ninguém
// commitou: nada disso existe no worktree, então o gate reprova antes do push.
//
//   node scripts/persona/gate-on-head.mjs                    (HEAD; sai com o código do gate)
//   node scripts/persona/gate-on-head.mjs --ref <commit>     (outro commit)
//   node scripts/persona/gate-on-head.mjs --check-only       (só monta o worktree e roda `check-pkg` dos pacotes que vierem depois de `--pkgs`; sem build/smoke: prova rápida)
//   node scripts/persona/gate-on-head.mjs --keep             (não apaga o worktree no fim; ele fica em ../.persona-gate-head/<sha>)
//   node scripts/persona/gate-on-head.mjs -- --skip-smoke    (o que vem depois de `--` vai para o persona-gate)
//   node scripts/persona/gate-on-head.mjs --pkgs persona-sync client-ui-persona --check-only
// Os node_modules são COMPARTILHADOS (junções para os originais: terceiros ficam onde estão) EXCETO os links de workspace (@deepseek-ai/dsh-*), que são refeitos para apontar para o worktree:
// senão um pacote do commit seria compilado contra o fonte do WIP de outro pacote. O gate pesado precisa do lock de build: rode com `node scripts/persona/with-lock.mjs "<rótulo>" --lock build -- node scripts/persona/gate-on-head.mjs`.
// Se o gate passa, o selo `.maestri/tmp/persona-gate-ok.json` do worktree é copiado para o repositório (a árvore do HEAD é a mesma; o pre-push o aceita).
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

/** Pastas onde o pnpm cria `node_modules` de workspace (pnpm-workspace.yaml): a raiz e um nível/dois de packages, apps, vendor, native. */
export function workspaceDirs(root) {
  const dirs = ['']
  const children = (rel) => { try { return readdirSync(join(root, rel), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')).map((entry) => `${rel}/${entry.name}`) } catch { return [] } }
  for (const group of ['packages', 'vendor']) for (const first of children(group)) { dirs.push(first); for (const second of children(first)) dirs.push(second) }
  for (const first of children('apps')) dirs.push(first)
  for (const extra of ['benchmarks', 'website', 'native/system']) dirs.push(extra)
  for (const first of children('native/system/packages')) dirs.push(first)
  return dirs.map((rel) => rel.replace(/^\//u, '')).filter((rel) => existsSync(join(root, rel, 'node_modules')))
}

const norm = (path) => path.replaceAll('\\', '/').replace(/\/+$/u, '').toLowerCase()

/** Para onde um link de workspace deve apontar no worktree: o mesmo caminho relativo dentro dele; links para fora do repositório (a loja do pnpm) ficam como estão. */
export function mapTarget(target, originalRoot, worktreeRoot) {
  const from = norm(originalRoot)
  const to = norm(target)
  if (to === from || !to.startsWith(`${from}/`)) return target
  const rel = to.slice(from.length + 1)
  if (rel.startsWith('node_modules/')) return target // a loja (.pnpm) é compartilhada
  return join(worktreeRoot, ...rel.split('/'))
}

function link(target, path) {
  try { symlinkSync(target, path, 'junction') } catch { copyFileSync(target, path) } // arquivo solto: cópia
}

/** Refaz `<src>` em `<dst>`: tudo vira junção para o original, menos os links de workspace (apontam para o worktree) e as pastas @escopo (entradas recriadas uma a uma). */
export function relink(src, dst, originalRoot, worktreeRoot) {
  mkdirSync(dst, { recursive: true })
  for (const entry of readdirSync(src)) {
    const from = join(src, entry)
    const to = join(dst, entry)
    const stat = lstatSync(from)
    if (stat.isSymbolicLink()) {
      const target = resolve(dirname(from), readlinkSync(from))
      link(mapTarget(target, originalRoot, worktreeRoot), to)
    } else if (stat.isDirectory() && entry.startsWith('@')) relink(from, to, originalRoot, worktreeRoot)
    else link(realpathSync(from), to)
  }
}

/** Liga todos os node_modules do repositório original ao worktree. */
export function linkNodeModules(originalRoot, worktreeRoot) {
  const dirs = workspaceDirs(originalRoot)
  for (const rel of dirs) relink(join(originalRoot, rel, 'node_modules'), join(worktreeRoot, rel, 'node_modules'), originalRoot, worktreeRoot)
  return dirs.length
}

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })
}

export function parseArgs(argv) {
  const args = { flags: new Set(), pkgs: [], passthrough: [], ref: 'HEAD' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') { args.passthrough = argv.slice(i + 1); break }
    if (arg === '--ref') { args.ref = argv[++i] ?? 'HEAD' } else if (arg === '--pkgs') { while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) args.pkgs.push(argv[++i]) } else if (arg.startsWith('--')) args.flags.add(arg.slice(2))
    else throw new Error(`argumento inesperado: ${arg}`)
  }
  return args
}

function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) } catch (error) { console.error(`uso: ${error.message}`); process.exit(2) }
  const sha = git(REPO_ROOT, ['rev-parse', '--verify', `${args.ref}^{commit}`])
  if (sha.status !== 0) { console.error(`ref inexistente: ${args.ref}`); process.exit(2) }
  const commit = sha.stdout.trim()
  const worktree = join(dirname(REPO_ROOT), '.persona-gate-head', commit.slice(0, 10))
  const log = (message) => console.log(`[gate-on-head ${new Date().toISOString()}] ${message}`)
  if (existsSync(worktree)) { git(REPO_ROOT, ['worktree', 'remove', '--force', worktree]); rmSync(worktree, { recursive: true, force: true }) }
  mkdirSync(dirname(worktree), { recursive: true })
  const added = git(REPO_ROOT, ['worktree', 'add', '--detach', '--force', worktree, commit])
  if (added.status !== 0) { console.error(`git worktree add falhou: ${added.stderr.trim()}`); process.exit(2) }
  log(`worktree limpo de ${commit.slice(0, 10)} em ${worktree}`)
  let status = 1
  try {
    const count = linkNodeModules(REPO_ROOT, worktree)
    log(`${String(count)} pasta(s) node_modules religada(s) (links de workspace apontam para o worktree)`)
    const run = (cmd, cmdArgs) => spawnSync(cmd, cmdArgs, { cwd: worktree, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'pnpm' })
    if (args.flags.has('check-only')) {
      const names = args.pkgs.length > 0 ? args.pkgs : ['persona-core']
      status = run(process.execPath, ['scripts/persona/check-pkg.mjs', ...names]).status ?? 1
    } else {
      status = run(process.execPath, ['scripts/persona/persona-gate.mjs', ...args.passthrough]).status ?? 1
      const stamp = join(worktree, '.maestri', 'tmp', 'persona-gate-ok.json')
      if (status === 0 && existsSync(stamp)) {
        mkdirSync(join(REPO_ROOT, '.maestri', 'tmp'), { recursive: true })
        copyFileSync(stamp, join(REPO_ROOT, '.maestri', 'tmp', 'persona-gate-ok.json'))
        log('gate verde no commit limpo: selo copiado para o repositório')
      }
    }
  } finally {
    if (args.flags.has('keep')) log(`worktree mantido: ${worktree}`)
    else { git(REPO_ROOT, ['worktree', 'remove', '--force', worktree]); rmSync(worktree, { recursive: true, force: true }); git(REPO_ROOT, ['worktree', 'prune']) }
  }
  console.log(status === 0 ? `GATE_ON_HEAD ok ${commit.slice(0, 10)}` : `GATE_ON_HEAD failing ${commit.slice(0, 10)}`)
  process.exit(status)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()

#!/usr/bin/env node
// FECHO DE IMPORTAÇÕES DE UMA ÁRVORE AINDA SEM COMMIT (Gauge, a pedido do Keel 12/11): o `check-head-closure.mjs` só acha o import sem alvo DEPOIS do commit. Este confere ANTES de gravar:
// ele monta a árvore do que está no ÍNDICE (`git write-tree`, com o índice privado de quem passa `--index`) e aplica a MESMA regra e a mesma saída do fecho do HEAD sobre ela. O que está só no disco
// (arquivo novo sem `git add`, edição sem stage) não conta: é exatamente o que o commit levaria.
//
//   node scripts/persona/check-tree-closure.mjs                         (o índice padrão do repositório)
//   node scripts/persona/check-tree-closure.mjs --index <arquivo>       (um índice PRIVADO: GIT_INDEX_FILE=<arquivo>; o arquivo precisa existir)
//   node scripts/persona/check-tree-closure.mjs --tree <sha>            (uma árvore que já existe no repositório)
//   --root <pasta> · --scope a/,b/ · --all · --baseline <json> · --json   (os mesmos do check-head-closure)
// SÓ LÊ: não muda o índice (nem um byte: o `git write-tree` roda numa CÓPIA dele, porque write-tree regrava o índice que lê), nem o HEAD, nem os arquivos. A única escrita é o objeto de árvore que o
// `git write-tree` grava no banco de objetos (idempotente, sem referência; o gc leva).
// Saída: 0 = fecha, 1 = import sem alvo na árvore, 2 = uso errado / índice inexistente / `write-tree` falhou. Não está ligado ao gate (é a conferência que o Keel faz antes de gravar o commit).
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { closureOfTreeish, renderText } from './check-head-closure.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')

/** A árvore (sha) do que está no índice; `indexFile` aponta um índice privado (GIT_INDEX_FILE). Lança erro se o arquivo não existe (um índice inexistente viraria uma árvore VAZIA e "passaria"). */
export function writeTree({ root = REPO_ROOT, indexFile } = {}) {
  // `git write-tree` REGRAVA o índice que lê (acrescenta a extensão "cache-tree"): sem mudar nada do conteúdo, mas mudando os bytes. Para SÓ LER de verdade, trabalha numa CÓPIA do índice.
  let source
  if (indexFile !== undefined) {
    if (!existsSync(resolve(indexFile))) throw new Error(`índice não existe: ${indexFile}`)
    source = resolve(indexFile)
  } else {
    const located = spawnSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-path', 'index'], { encoding: 'utf8', env: process.env })
    source = process.env.GIT_INDEX_FILE !== undefined ? resolve(process.env.GIT_INDEX_FILE) : String(located.stdout).trim()
    if (located.status !== 0 && process.env.GIT_INDEX_FILE === undefined) throw new Error('não achei o índice do repositório')
    if (!existsSync(source)) throw new Error(`índice não existe: ${source}`)
  }
  const dir = mkdtempSync(join(tmpdir(), 'tree-closure-index-'))
  try {
    const copy = join(dir, 'index')
    copyFileSync(source, copy)
    const result = spawnSync('git', ['-C', root, 'write-tree'], { encoding: 'utf8', env: { ...process.env, GIT_INDEX_FILE: copy } })
    if (result.status !== 0) throw new Error(`git write-tree falhou: ${String(result.stderr).trim().slice(0, 300) || `exit ${String(result.status)}`}`)
    return result.stdout.trim()
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

/**
 * @param {{ root?: string, indexFile?: string, tree?: string, known?: Iterable<string>, scopes?: readonly string[] | 'all' }} options
 * @returns O mesmo resultado do `checkHeadClosure` (+ `tree`), com `subject: 'árvore'`.
 */
export function checkTreeClosure(options = {}) {
  const root = options.root ?? REPO_ROOT
  const tree = options.tree ?? writeTree({ root, indexFile: options.indexFile })
  const label = options.tree !== undefined ? `árvore ${options.tree.slice(0, 10)}` : options.indexFile !== undefined ? `índice ${basename(options.indexFile)}` : 'índice'
  return { ...closureOfTreeish(tree, { root, known: options.known, scopes: options.scopes, label, commit: tree.slice(0, 10), subject: 'árvore' }), tree }
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
    if (['--index', '--tree', '--root', '--scope', '--baseline'].includes(argv[i])) {
      if (i + 1 >= argv.length) { console.error(`uso: ${argv[i]} precisa de um valor`); process.exit(2) }
      values[argv[i].slice(2)] = argv[++i]
    } else if (argv[i].startsWith('--')) flags.add(argv[i].slice(2))
    else { console.error(`uso: argumento inesperado ${argv[i]}`); process.exit(2) }
  }
  if (values.index !== undefined && values.tree !== undefined) { console.error('uso: --index e --tree são alternativas'); process.exit(2) }
  const baseline = values.baseline === undefined ? resolve(HERE, 'check-head-closure.baseline.json') : resolve(values.baseline)
  const scopes = flags.has('all') ? 'all' : values.scope === undefined ? undefined : values.scope.split(',').map((item) => (item.endsWith('/') ? item : `${item}/`))
  let result
  try { result = checkTreeClosure({ root: values.root === undefined ? undefined : resolve(values.root), indexFile: values.index, tree: values.tree, known: loadKnown(baseline), scopes }) } catch (error) { console.error(`erro: ${error.message}`); process.exit(2) }
  console.log(flags.has('json') ? JSON.stringify(result, null, 2) : renderText(result))
  process.exit(result.ok ? 0 : 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()

// node --test scripts/persona/check-tree-closure.test.mjs
// Repositórios git SINTÉTICOS numa pasta temporária: nada do repositório real é tocado.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkHeadClosure } from './check-head-closure.mjs'
import { checkTreeClosure, writeTree } from './check-tree-closure.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'check-tree-closure.mjs')
const PKG = 'packages/persona/demo/src'
const RM = { recursive: true, force: true }

function git(root, args, env = {}) {
  const result = spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', env: { ...process.env, ...env } })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout
}
function put(root, rel, text) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'tree-closure-'))
  git(root, ['init', '-q'])
  put(root, `${PKG}/base.ts`, 'export const base = 1\n')
  git(root, ['add', '-A'])
  git(root, ['commit', '-q', '-m', 'c0'])
  return root
}
const sha1 = (path) => createHash('sha1').update(readFileSync(path)).digest('hex')

test('O PEDIDO: arquivo STAGED que importa um arquivo UNTRACKED = falha (com arquivo:linha); depois do `git add` do alvo = passa', () => {
  const root = repo()
  try {
    put(root, `${PKG}/index.ts`, "export * from './novo'\n")
    git(root, ['add', `${PKG}/index.ts`])
    put(root, `${PKG}/novo.ts`, 'export const novo = 1\n') // está no DISCO, não no índice: o commit não o levaria
    const broken = checkTreeClosure({ root })
    assert.equal(broken.ok, false)
    assert.equal(broken.subject, 'árvore')
    assert.deepEqual(broken.unresolved, [{ file: `${PKG}/index.ts`, spec: './novo', line: 1 }])
    const cli = spawnSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8' })
    assert.equal(cli.status, 1)
    assert.match(cli.stdout, /FALHOU .*index\.ts:1 — import '\.\/novo' não existe na árvore/u)
    git(root, ['add', `${PKG}/novo.ts`])
    const fixed = checkTreeClosure({ root })
    assert.equal(fixed.ok, true)
    assert.equal(spawnSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8' }).status, 0)
  } finally { rmSync(root, RM) }
})

test('só vale o que está NO ÍNDICE: uma edição sem stage não conta, nem a favor nem contra', () => {
  const root = repo()
  try {
    put(root, `${PKG}/a.ts`, "import './base'\n")
    git(root, ['add', '-A'])
    assert.equal(checkTreeClosure({ root }).ok, true)
    put(root, `${PKG}/a.ts`, "import './sumiu'\n") // edição NÃO staged que quebraria: o índice ainda tem a versão boa
    assert.equal(checkTreeClosure({ root }).ok, true)
    git(root, ['add', `${PKG}/a.ts`]) // agora ela entra no índice
    assert.equal(checkTreeClosure({ root }).ok, false)
    put(root, `${PKG}/a.ts`, "import './base'\n") // conserto sem stage: o índice continua quebrado
    assert.equal(checkTreeClosure({ root }).ok, false)
  } finally { rmSync(root, RM) }
})

test('ÍNDICE PRIVADO (--index): usa o GIT_INDEX_FILE do arquivo, não o índice padrão', () => {
  const root = repo()
  try {
    const priv = join(root, '.git', 'indice-privado')
    git(root, ['read-tree', 'HEAD'], { GIT_INDEX_FILE: priv })
    put(root, `${PKG}/index.ts`, "export * from './novo'\n")
    put(root, `${PKG}/novo.ts`, 'export const novo = 1\n')
    git(root, ['add', `${PKG}/index.ts`], { GIT_INDEX_FILE: priv }) // o privado leva o importador, NÃO o alvo
    git(root, ['add', '-A']) // o índice PADRÃO leva os dois
    assert.equal(checkTreeClosure({ root }).ok, true, 'o padrão fecha')
    const viaPrivate = checkTreeClosure({ root, indexFile: priv })
    assert.equal(viaPrivate.ok, false, 'o privado não fecha')
    assert.deepEqual(viaPrivate.unresolved.map((item) => item.spec), ['./novo'])
    const cli = spawnSync(process.execPath, [CLI, '--root', root, '--index', priv], { encoding: 'utf8' })
    assert.equal(cli.status, 1)
    assert.match(cli.stdout, /índice indice-privado/u)
  } finally { rmSync(root, RM) }
})

test('SÓ LÊ: o índice, o HEAD e os arquivos ficam byte a byte como estavam', () => {
  const root = repo()
  try {
    put(root, `${PKG}/index.ts`, "export * from './novo'\n")
    put(root, `${PKG}/novo.ts`, 'export const novo = 1\n')
    git(root, ['add', `${PKG}/index.ts`])
    git(root, ['status', '--porcelain']) // o próprio `git status` regrava o índice (atualiza o stat): faça isso ANTES de fotografar, para só medir o que a FERRAMENTA faz
    const snapshot = () => ({ index: sha1(join(root, '.git', 'index')), head: git(root, ['rev-parse', 'HEAD']), file: sha1(join(root, PKG, 'index.ts')), novo: sha1(join(root, PKG, 'novo.ts')) })
    const before = snapshot()
    checkTreeClosure({ root })
    spawnSync(process.execPath, [CLI, '--root', root], { encoding: 'utf8' })
    assert.deepEqual(snapshot(), before)
    assert.equal(git(root, ['status', '--porcelain']), 'A  packages/persona/demo/src/index.ts\n?? packages/persona/demo/src/novo.ts\n') // nada foi staged nem desfeito
  } finally { rmSync(root, RM) }
})

test('índice inexistente = erro (exit 2), NUNCA uma árvore vazia que "passa"; --index junto de --tree é uso errado', () => {
  const root = repo()
  try {
    assert.throws(() => writeTree({ root, indexFile: join(root, 'nao-existe') }), /índice não existe/u)
    assert.equal(spawnSync(process.execPath, [CLI, '--root', root, '--index', join(root, 'nao-existe')], { encoding: 'utf8' }).status, 2)
    assert.equal(spawnSync(process.execPath, [CLI, '--root', root, '--index', join(root, '.git', 'index'), '--tree', 'abc'], { encoding: 'utf8' }).status, 2)
  } finally { rmSync(root, RM) }
})

test('MESMA REGRA do fecho do HEAD: um índice igual ao HEAD dá o mesmo veredito; --tree olha uma árvore que já existe', () => {
  const root = repo()
  try {
    put(root, `${PKG}/b.ts`, "import './fantasma'\nimport './base'\n")
    git(root, ['add', '-A'])
    git(root, ['commit', '-q', '-m', 'c1'])
    const head = checkHeadClosure({ root })
    const tree = checkTreeClosure({ root })
    assert.equal(tree.ok, head.ok)
    assert.deepEqual(tree.unresolved, head.unresolved)
    assert.equal(tree.files, head.files)
    assert.equal(tree.imports, head.imports)
    const sha = git(root, ['rev-parse', 'HEAD^{tree}']).trim()
    const direct = checkTreeClosure({ root, tree: sha })
    assert.deepEqual(direct.unresolved, head.unresolved)
    assert.match(spawnSync(process.execPath, [CLI, '--root', root, '--tree', sha], { encoding: 'utf8' }).stdout, /fecho de importações de árvore/u)
  } finally { rmSync(root, RM) }
})

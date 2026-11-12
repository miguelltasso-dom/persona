// node --test scripts/persona/check-head-closure.test.mjs
// Repositórios git SINTÉTICOS numa pasta temporária: nada do repositório real é tocado.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkHeadClosure, importsOf, normalizePath, renderText, resolveImport, skeletonOf } from './check-head-closure.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'check-head-closure.mjs')
const PKG = 'packages/persona/demo/src'

// ------------------------------------------------------------------------------------------------------------------------------ o leitor de imports

test('importsOf: from, export-from, import de efeito, import(), require() e @import de CSS; só relativos', () => {
  const ts = [
    "import { a } from './a'",
    "import type { B } from '../b.ts'",
    "export * from './c'",
    "import './side-effect.css'",
    "const lazy = () => import('./lazy')",
    "const old = require('./old.cjs')",
    "import pkg from 'react'",
    "import node from 'node:fs'",
    "import alias from '@/x/y'",
  ].join('\n')
  assert.deepEqual(importsOf(ts, 'x.ts').map((item) => item.spec), ['./a', '../b.ts', './c', './side-effect.css', './lazy', './old.cjs'])
  assert.deepEqual(importsOf("@import './base.css';\n@import url('../theme.css');\n/* @import './comentado.css'; */", 'x.css').map((item) => item.spec), ['./base.css', '../theme.css'])
})

test('importsOf: multilinha acha o `from` e o número da linha continua certo (também depois de comentário de bloco e de template de várias linhas)', () => {
  const text = ['/* uma', ' * duas */', 'const t = `a', 'b`', 'import {', '  um,', '  dois,', "} from './multi'"].join('\n')
  assert.deepEqual(importsOf(text, 'x.ts'), [{ spec: './multi', line: 8 }])
})

test('importsOf: NUNCA conta comentário, nem string, nem template (a fixture de um teste que ESCREVE um arquivo com imports)', () => {
  const text = [
    "// import { x } from './comentado'",
    "/* import { y } from './em-bloco' */",
    "const fixture = \"import { z } from './dentro-de-string'\"",
    'const outra = `import { w } from "./dentro-de-template"`',
    'const dinamica = `./${nome}.png`',
    "import { real } from './real'",
  ].join('\n')
  assert.deepEqual(importsOf(text, 'x.ts').map((item) => item.spec), ['./real'])
})

test('skeletonOf: devolve o texto cru de cada string e mantém as quebras de linha', () => {
  const { code, strings } = skeletonOf("const a = 'um'\nconst b = `x\ny`\n")
  assert.deepEqual(strings, ['um', 'x\ny'])
  assert.equal(code.split('\n').length, 4)
})

// ------------------------------------------------------------------------------------------------------------------------------ a resolução

test('resolveImport: exato, extensões, index, .js→.ts e .mjs→.mts, ?query, e a raiz não é ultrapassada', () => {
  const tree = new Set(['a/b/c.ts', 'a/b/d/index.tsx', 'a/b/e.mts', 'a/b/f.css', 'a/b/g.svg', 'a/x.ts'])
  const at = (spec) => resolveImport(tree, 'a/b/main.ts', spec)
  assert.equal(at('./c'), 'a/b/c.ts')
  assert.equal(at('./c.ts'), 'a/b/c.ts')
  assert.equal(at('./c.js'), 'a/b/c.ts') // o TypeScript escreve .js para o .ts que existe
  assert.equal(at('./d'), 'a/b/d/index.tsx')
  assert.equal(at('./e.mjs'), 'a/b/e.mts')
  assert.equal(at('./f.css?inline'), 'a/b/f.css')
  assert.equal(at('./g.svg?raw'), 'a/b/g.svg')
  assert.equal(at('../x'), 'a/x.ts')
  assert.equal(at('./nao-existe'), undefined)
  assert.equal(at('../../../../acima'), undefined)
  assert.equal(normalizePath('a/b/../c/./d'), 'a/c/d')
})

// ------------------------------------------------------------------------------------------------------------------------------ o commit de verdade

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout
}
function put(root, rel, text) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'head-closure-'))
  git(root, 'init', '-q')
  return root
}
const commit = (root, message) => { git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', message) }
const RM = { recursive: true, force: true }

test('O INCIDENTE: o HEAD importa um arquivo novo que ficou sem git add → FALHA com o arquivo e a linha; com o arquivo commitado → PASSA', () => {
  const root = repo()
  try {
    put(root, `${PKG}/index.ts`, "export * from './novo'\n")
    git(root, 'add', `${PKG}/index.ts`)
    git(root, 'commit', '-q', '-m', 'c1')
    put(root, `${PKG}/novo.ts`, 'export const x = 1\n') // existe na ÁRVORE, não no HEAD: o gate da árvore passaria
    const broken = checkHeadClosure({ root })
    assert.equal(broken.ok, false)
    assert.deepEqual(broken.unresolved, [{ file: `${PKG}/index.ts`, spec: './novo', line: 1 }])
    assert.match(renderText(broken), /FALHOU .*index\.ts:1 — import '\.\/novo' não existe no commit/u)
    git(root, 'add', `${PKG}/novo.ts`) // staged, mas NÃO commitado: o HEAD continua quebrado
    assert.equal(checkHeadClosure({ root }).ok, false)
    git(root, 'commit', '-q', '-m', 'c2')
    const fixed = checkHeadClosure({ root })
    assert.equal(fixed.ok, true)
    assert.match(renderText(fixed), /PASSOU/u)
  } finally { rmSync(root, RM) }
})

test('apagar o ALVO de um import antigo quebra o fecho (o importador não mudou e ainda assim reprova)', () => {
  const root = repo()
  try {
    put(root, `${PKG}/a.ts`, "import { b } from './b'\nexport const a = b\n")
    put(root, `${PKG}/b.ts`, 'export const b = 1\n')
    commit(root, 'c1')
    assert.equal(checkHeadClosure({ root }).ok, true)
    git(root, 'rm', '-q', `${PKG}/b.ts`)
    git(root, 'commit', '-q', '-m', 'c2')
    const result = checkHeadClosure({ root })
    assert.equal(result.ok, false)
    assert.equal(result.unresolved[0].file, `${PKG}/a.ts`)
    assert.equal(checkHeadClosure({ root, ref: 'HEAD~1' }).ok, true) // --ref olha outro commit
  } finally { rmSync(root, RM) }
})

test('escopo: o fork fora do produto não reprova (fixtures de teste, build), a não ser com scopes "all"', () => {
  const root = repo()
  try {
    put(root, `${PKG}/ok.ts`, 'export const ok = 1\n')
    put(root, 'scripts/legado.spec.ts', "import './nao-existe'\n")
    commit(root, 'c1')
    assert.equal(checkHeadClosure({ root }).ok, true)
    assert.equal(checkHeadClosure({ root, scopes: 'all' }).ok, false)
  } finally { rmSync(root, RM) }
})

test('saída de build (lib/), overlay de empacotamento e baseline: não reprovam; um import novo sem alvo reprova', () => {
  const root = repo()
  try {
    put(root, 'apps/desktop/tests/fixtures/u.mjs', "import '../../lib/types/update.js'\n") // gerado pelo build, fora do git
    put(root, 'scripts/persona/pack-overlay/x.client.spec.tsx', "import '../src/client/primitives/About.tsx'\n") // copiado para dentro de um pacote
    put(root, `${PKG}/conhecido.ts`, "import './gerado-no-build'\n")
    commit(root, 'c1')
    const bare = checkHeadClosure({ root })
    assert.deepEqual(bare.unresolved.map((item) => item.file), [`${PKG}/conhecido.ts`])
    const known = checkHeadClosure({ root, known: [`${PKG}/conhecido.ts -> ./gerado-no-build`] })
    assert.equal(known.ok, true)
    assert.equal(known.knownHit, 1)
  } finally { rmSync(root, RM) }
})

test('ref inexistente: erro claro (o CLI sai com 2); fecho certo sai 0; quebrado sai 1', () => {
  const root = repo()
  try {
    put(root, `${PKG}/a.ts`, "import './b'\n")
    commit(root, 'c1')
    assert.throws(() => checkHeadClosure({ root, ref: 'nao-existe' }), /ref inexistente/u)
    const run = (...args) => spawnSync(process.execPath, [CLI, '--root', root, ...args], { encoding: 'utf8' })
    assert.equal(run('--ref', 'nao-existe').status, 2)
    assert.equal(run().status, 1)
    assert.match(run().stdout, /FALHOU .*a\.ts:1/u)
    put(root, `${PKG}/b.ts`, 'export {}\n')
    commit(root, 'c2')
    const ok = run()
    assert.equal(ok.status, 0)
    assert.match(ok.stdout, /PASSOU/u)
    assert.equal(JSON.parse(run('--json').stdout).ok, true)
  } finally { rmSync(root, RM) }
})

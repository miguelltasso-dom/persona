// node --test scripts/persona/gate-on-head.test.mjs
// Mini repositório SINTÉTICO numa pasta temporária (com links de workspace absolutos, como o pnpm faz no Windows); o repositório real não é tocado.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { installPnpmGuard, linkNodeModules, mapTarget, parseArgs, removeWorktree, unlinkLinks, workspaceDirs } from './gate-on-head.mjs'
import { isMutating, pnpmCommand } from './pnpm-guard.mjs'

const GUARD = join(dirname(fileURLToPath(import.meta.url)), 'pnpm-guard.mjs')

const RM = { recursive: true, force: true }
function put(path, text) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }

/** Um "repo" com raiz, dois pacotes que dependem um do outro por link de workspace ABSOLUTO, e um terceiro na loja .pnpm. */
function fakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'gate-head-repo-'))
  put(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n')
  put(join(root, 'packages/persona/a/package.json'), '{"name":"@deepseek-ai/dsh-a"}')
  put(join(root, 'packages/persona/b/package.json'), '{"name":"@deepseek-ai/dsh-b"}')
  put(join(root, 'packages/persona/a/src/index.ts'), 'export const a = 1\n')
  put(join(root, 'node_modules/.pnpm/terceiro@1.0.0/node_modules/terceiro/index.js'), 'module.exports = 1\n')
  // a/node_modules: @deepseek-ai/dsh-b -> repo/packages/persona/b (workspace) e terceiro -> loja
  mkdirSync(join(root, 'packages/persona/a/node_modules/@deepseek-ai'), { recursive: true })
  symlinkSync(join(root, 'packages/persona/b'), join(root, 'packages/persona/a/node_modules/@deepseek-ai/dsh-b'), 'junction')
  symlinkSync(join(root, 'node_modules/.pnpm/terceiro@1.0.0/node_modules/terceiro'), join(root, 'packages/persona/a/node_modules/terceiro'), 'junction')
  mkdirSync(join(root, 'node_modules/@deepseek-ai'), { recursive: true })
  symlinkSync(join(root, 'packages/persona/a'), join(root, 'node_modules/@deepseek-ai/dsh-a'), 'junction')
  return root
}

test('mapTarget: o link de WORKSPACE vai para o worktree; a loja do pnpm e o que é de fora do repositório ficam onde estão', () => {
  const from = 'C:\\repo'
  const to = 'C:\\wt\\abc'
  assert.equal(mapTarget('C:\\repo\\packages\\persona\\b', from, to).replaceAll('\\', '/'), 'C:/wt/abc/packages/persona/b')
  assert.equal(mapTarget('c:/REPO/apps/cli', from, to).replaceAll('\\', '/'), 'C:/wt/abc/apps/cli') // caixa e barra não importam (Windows)
  assert.equal(mapTarget('C:\\repo\\node_modules\\.pnpm\\x@1\\node_modules\\x', from, to), 'C:\\repo\\node_modules\\.pnpm\\x@1\\node_modules\\x')
  assert.equal(mapTarget('D:\\fora\\lib', from, to), 'D:\\fora\\lib')
  assert.equal(mapTarget('C:\\repo-irmao\\x', from, to), 'C:\\repo-irmao\\x') // prefixo de nome parecido não é o repositório
})

test('workspaceDirs acha a raiz e os pacotes que têm node_modules', () => {
  const root = fakeRepo()
  try {
    assert.deepEqual(workspaceDirs(root).sort(), ['', 'packages/persona/a'].sort())
  } finally { rmSync(root, RM) }
})

test('linkNodeModules: o pacote do worktree enxerga o OUTRO pacote DO WORKTREE (não o do repositório original); a loja é compartilhada', () => {
  const original = fakeRepo()
  const worktree = mkdtempSync(join(tmpdir(), 'gate-head-wt-'))
  try {
    put(join(worktree, 'packages/persona/b/marca.txt'), 'sou o b do worktree') // o b do worktree é OUTRO arquivo
    put(join(original, 'packages/persona/b/marca.txt'), 'sou o b do original (WIP)')
    const count = linkNodeModules(original, worktree)
    assert.equal(count, 2)
    const viaLink = join(worktree, 'packages/persona/a/node_modules/@deepseek-ai/dsh-b/marca.txt')
    assert.equal(readFileSync(viaLink, 'utf8'), 'sou o b do worktree')
    assert.ok(realpathSync(join(worktree, 'packages/persona/a/node_modules/@deepseek-ai/dsh-b')).startsWith(realpathSync(worktree)))
    // o link da RAIZ também aponta para o worktree
    assert.equal(realpathSync(join(worktree, 'node_modules/@deepseek-ai/dsh-a')), realpathSync(join(worktree, 'packages/persona/a')))
    // o terceiro vem da loja original (compartilhada): continua achável e é o MESMO arquivo
    assert.equal(readFileSync(join(worktree, 'packages/persona/a/node_modules/terceiro/index.js'), 'utf8'), 'module.exports = 1\n')
    assert.equal(realpathSync(join(worktree, 'packages/persona/a/node_modules/terceiro')), realpathSync(join(original, 'node_modules/.pnpm/terceiro@1.0.0/node_modules/terceiro')))
    assert.ok(existsSync(join(worktree, 'node_modules/.pnpm')))
  } finally { rmSync(worktree, RM); rmSync(original, RM) }
})

test('parseArgs: --ref, --pkgs, --check-only, --keep e o que vem depois de -- vai para o gate', () => {
  const args = parseArgs(['--ref', 'abc', '--check-only', '--pkgs', 'persona-sync', 'client-ui-persona', '--keep', '--', '--skip-smoke', '--skip-typert'])
  assert.equal(args.ref, 'abc')
  assert.deepEqual(args.pkgs, ['persona-sync', 'client-ui-persona'])
  assert.equal(args.flags.has('check-only') && args.flags.has('keep'), true)
  assert.deepEqual(args.passthrough, ['--skip-smoke', '--skip-typert'])
  assert.equal(parseArgs([]).ref, 'HEAD')
  assert.throws(() => parseArgs(['solto']), /argumento inesperado/u)
})

// ------------------------------------------------------------------------------------------------------------------------------ SEGURANÇA (Keel 12/11)

/** Fotografia do que existe no repositório "original": caminho → conteúdo (arquivos) ou 'dir'; segue só o que NÃO é link, e anota os links com o alvo. */
function snapshot(root) {
  const out = new Map()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink()) out.set(path, `link:${realpathSync(path)}`)
      else if (stat.isDirectory()) { out.set(path, 'dir'); walk(path) } else out.set(path, readFileSync(path, 'utf8'))
    }
  }
  walk(root)
  return out
}

test('APAGAR O WORKTREE NÃO TOCA O ORIGINAL: depois de desfazer os links e apagar tudo, a loja, os pacotes e os links do original continuam idênticos', () => {
  const original = fakeRepo()
  const worktree = mkdtempSync(join(tmpdir(), 'gate-head-wt-'))
  try {
    put(join(original, 'node_modules/.pnpm/terceiro@1.0.0/node_modules/terceiro/lib/fundo.js'), 'fundo da loja\n')
    put(join(worktree, 'packages/persona/b/marca.txt'), 'b do worktree')
    linkNodeModules(original, worktree)
    const before = snapshot(original)
    assert.ok(before.size > 8)
    // o worktree tem links (junções) para dentro do original: o rm recursivo "ingênuo" seria o perigo; removeWorktree desfaz os links PRIMEIRO
    const links = removeWorktree(worktree, original)
    assert.ok(links >= 3, `devia ter desfeito os links (desfez ${String(links)})`)
    assert.equal(existsSync(worktree), false)
    assert.deepEqual(snapshot(original), before) // nenhum arquivo, pasta ou link do original mudou ou sumiu
    assert.equal(readFileSync(join(original, 'node_modules/.pnpm/terceiro@1.0.0/node_modules/terceiro/lib/fundo.js'), 'utf8'), 'fundo da loja\n')
  } finally { rmSync(worktree, RM); rmSync(original, RM) }
})

test('unlinkLinks desfaz só LINKS: deixa os arquivos e pastas reais do worktree, e não desce no alvo de nenhum link', () => {
  const original = fakeRepo()
  const worktree = mkdtempSync(join(tmpdir(), 'gate-head-wt-'))
  try {
    put(join(worktree, 'src/real.ts'), 'real')
    linkNodeModules(original, worktree)
    const before = snapshot(original)
    const count = unlinkLinks(worktree)
    assert.ok(count >= 3)
    assert.equal(readFileSync(join(worktree, 'src/real.ts'), 'utf8'), 'real')
    const left = [...snapshot(worktree).values()].filter((value) => typeof value === 'string' && value.startsWith('link:'))
    assert.deepEqual(left, []) // nenhum link sobrou
    assert.deepEqual(snapshot(original), before)
  } finally { rmSync(worktree, RM); rmSync(original, RM) }
})

test('pnpm-guard: install/add/update/... são recusados (também com --filter/-C antes); run/exec/--filter run passam', () => {
  for (const args of [['install'], ['i'], ['add', 'x'], ['--filter', 'a', 'install'], ['-C', 'dir', 'update'], ['--filter=a', 'install'], ['remove', 'x'], ['store', 'prune'], ['dedupe'], ['up']]) {
    assert.equal(isMutating(args), true, args.join(' '))
  }
  for (const args of [['run', 'bundle'], ['exec', 'tsc', '-p', 'x'], ['--filter', '@deepseek-ai/dsh-client-ui-persona', 'run', 'bundle'], ['vitest'], [], ['-v'], ['exec', 'vitest', 'run', 'install']]) {
    assert.equal(isMutating(args), false, args.join(' '))
  }
  assert.equal(pnpmCommand(['--filter', 'a', '-C', 'b', 'run', 'x']), 'run')
})

test('pnpm-guard de verdade (processo): recusa install com exit 99 e a mensagem; repassa o resto ao "pnpm real"', () => {
  const refused = spawnSync(process.execPath, [GUARD, 'install'], { encoding: 'utf8', env: { ...process.env, GATE_REAL_PNPM: process.execPath } })
  assert.equal(refused.status, 99)
  assert.match(refused.stderr, /RECUSADO/u)
  const passed = spawnSync(process.execPath, [GUARD, '-v'], { encoding: 'utf8', env: { ...process.env, GATE_REAL_PNPM: process.execPath } }) // o "pnpm real" é o node: `node -v`
  assert.equal(passed.status, 0)
  assert.match(passed.stdout, /^v\d+/u)
})

test('o SHIM no PATH do worktree: `pnpm install` é recusado (99) e `pnpm -v` chega ao "pnpm real" (pré-voo do gate)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-head-shim-'))
  try {
    const shimEnv = installPnpmGuard(dir, GUARD, process.execPath)
    const env = { ...process.env, ...shimEnv }
    const shell = process.platform === 'win32'
    const refused = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: dir, env, encoding: 'utf8', shell })
    assert.equal(refused.status, 99, `${refused.stdout}${refused.stderr}`)
    const passed = spawnSync('pnpm', ['-v'], { cwd: dir, env, encoding: 'utf8', shell })
    assert.equal(passed.status, 0, `${passed.stdout}${passed.stderr}`)
    assert.match(passed.stdout, /^v\d+/u)
  } finally { rmSync(dir, RM) }
})

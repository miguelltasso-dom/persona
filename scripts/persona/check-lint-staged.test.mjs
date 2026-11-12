// node --test scripts/persona/check-lint-staged.test.mjs
// Fixtures: um repositório git temporário com um config mínimo do oxlint (só no-debugger e no-var); o binário do oxlint é o do próprio repo.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { batchesOf, collectFiles, isLintable, MAX_ARGS_CHARS, parseArgs, parseUnix, renderText, runLint, summarize, UsageError } from './check-lint-staged.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'check-lint-staged.mjs')
const tmp = () => mkdtempSync(join(tmpdir(), 'lintst-'))
const put = (root, rel, text) => { const path = join(root, rel); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text) }
const git = (root, ...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { encoding: 'utf8' })
const CONFIG = JSON.stringify({ rules: { 'no-debugger': 'error', 'no-var': 'error' } })
const CLEAN = 'export const ok = (a: number): number => a + 1\n'
const BAD = 'export const f = () => {\n  debugger\n  return 1\n}\n'

function repo() {
  const root = tmp()
  git(root, 'init', '-q')
  put(root, '.oxlintrc.staged.json', CONFIG)
  put(root, 'src/limpo.ts', CLEAN)
  put(root, 'src/velho.ts', CLEAN)
  put(root, 'README.md', '# x\n')
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'base')
  return root
}
const cli = (root, ...args) => spawnSync(process.execPath, [CLI, '--root', root, ...args], { encoding: 'utf8' })

test('recorte do hook: *.{ts,tsx,mts,cts,mjs}, fora de vendor/*/src; js e md não', () => {
  for (const ok of ['a.ts', 'src/a.tsx', 'x/a.mts', 'x/a.cts', 'scripts/a.mjs', 'vendor/foo/lib/a.ts']) assert.equal(isLintable(ok), true, ok)
  for (const no of ['a.js', 'a.md', 'a.json', 'vendor/foo/src/a.ts', 'vendor/foo/src/deep/a.tsx', 'a.d.tsx.map']) assert.equal(isLintable(no), false, no)
})

test('*.d.ts (emit GERADO, nunca vai ao stage) fica fora por padrão em todos os modos; --include-dts traz de volta', () => {
  for (const dts of ['a.d.ts', 'packages/credentials/credentials/src/index.d.ts', 'x/types.d.mts', 'x/types.d.cts']) {
    assert.equal(isLintable(dts), false, dts)
    assert.equal(isLintable(dts, { dts: true }), true, dts)
  }
  assert.equal(isLintable('src/d.ts'), true) // "d.ts" no nome não é declaração
  assert.equal(isLintable('src/odd.tsx'), true)
  const root = repo()
  try {
    put(root, 'src/gerado.d.ts', BAD)
    put(root, 'src/dados.ts', BAD)
    assert.deepEqual(collectFiles({ root }), ['src/dados.ts']) // o .d.ts novo não entra
    assert.deepEqual(collectFiles({ root, includeDts: true }), ['src/dados.ts', 'src/gerado.d.ts'])
    assert.deepEqual(collectFiles({ root, files: ['src'] }), ['src/dados.ts', 'src/limpo.ts', 'src/velho.ts'])
    const padrao = cli(root, '--files', 'src')
    assert.equal(padrao.status, 1)
    assert.doesNotMatch(padrao.stdout, /gerado\.d\.ts/u)
    assert.match(padrao.stdout, /FALHOU \[lint\] src\/dados\.ts:2:3/u)
    const com = cli(root, '--files', 'src', '--include-dts')
    assert.match(com.stdout, /FALHOU \[lint\] src\/gerado\.d\.ts:2:3/u)
    assert.equal(cli(root, '--files', 'src/gerado.d.ts').status, 0) // só o .d.ts: nada a lintar, passa
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('lotes: cada um cabe no limite, a ordem se mantém, nenhum arquivo se perde; um nome gigante vai sozinho', () => {
  const files = Array.from({ length: 50 }, (_, i) => `packages/algum/pacote/src/arquivo-${String(i).padStart(3, '0')}.ts`)
  const batches = batchesOf(files, 400)
  assert.ok(batches.length > 1)
  assert.deepEqual(batches.flat(), files)
  for (const batch of batches) assert.ok(batch.join(' ').length <= 400)
  assert.deepEqual(batchesOf(['x'.repeat(500), 'b.ts'], 100), [['x'.repeat(500)], ['b.ts']])
  assert.deepEqual(batchesOf([]), [])
  assert.ok(MAX_ARGS_CHARS < 32_000, 'precisa ficar abaixo do limite de CreateProcess')
})

test('parseUnix: arquivo:linha:coluna, regra e severidade; rodapé e linhas soltas são ignorados; caminho do Windows vira /', () => {
  const out = [
    'src/a.ts:49:35: Expected parentheses around arrow function. [Error/@stylistic(arrow-parens)]',
    'C:\\x\\y.ts:3:1: Unexpected var, use let or const instead. [Warning/eslint(no-var)]',
    '',
    '2 problems',
  ].join('\r\n')
  assert.deepEqual(parseUnix(out), [
    { file: 'src/a.ts', line: 49, column: 35, message: 'Expected parentheses around arrow function.', severity: 'erro', rule: '@stylistic(arrow-parens)' },
    { file: 'C:/x/y.ts', line: 3, column: 1, message: 'Unexpected var, use let or const instead.', severity: 'aviso', rule: 'eslint(no-var)' },
  ])
  assert.deepEqual(parseUnix('nada aqui\n0 problems'), [])
})

test('arquivos: alterado, novo (não rastreado) e staged entram; apagado, .md e js não; --staged vê só o index; pasta e caminho inexistente em --files', () => {
  const root = repo()
  try {
    put(root, 'src/velho.ts', BAD) // alterado, não staged
    put(root, 'src/novo.ts', BAD) // não rastreado
    put(root, 'src/staged.ts', BAD); git(root, 'add', 'src/staged.ts') // no index
    put(root, 'src/solto.js', BAD)
    put(root, 'NOTAS.md', 'oi\n')
    rmSync(join(root, 'src/limpo.ts')); // apagado
    assert.deepEqual(collectFiles({ root }), ['src/novo.ts', 'src/staged.ts', 'src/velho.ts'])
    assert.deepEqual(collectFiles({ root, staged: true }), ['src/staged.ts'])
    assert.deepEqual(collectFiles({ root, files: ['src'] }), ['src/novo.ts', 'src/staged.ts', 'src/velho.ts'])
    assert.deepEqual(collectFiles({ root, files: ['src/velho.ts', 'NOTAS.md'] }), ['src/velho.ts'])
    assert.throws(() => collectFiles({ root, files: ['src/nao-existe.ts'] }), UsageError)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('runLint de verdade: acha o erro com arquivo:linha:coluna e a regra; arquivo limpo não acusa', () => {
  const root = repo()
  try {
    put(root, 'src/ruim.ts', BAD)
    const problems = runLint({ root, files: ['src/ruim.ts', 'src/limpo.ts'] })
    assert.equal(problems.length, 1)
    assert.deepEqual({ ...problems[0], message: undefined }, { file: 'src/ruim.ts', line: 2, column: 3, message: undefined, severity: 'erro', rule: 'eslint(no-debugger)' })
    assert.deepEqual(runLint({ root, files: ['src/limpo.ts'] }), [])
    const result = summarize(['src/ruim.ts', 'src/limpo.ts'], problems)
    assert.equal(result.ok, false)
    assert.deepEqual(result.byFile, { 'src/ruim.ts': 1 })
    assert.match(renderText(result), /FALHOU \[lint\] src\/ruim\.ts:2:3 — .*\[eslint\(no-debugger\)\]\npor arquivo: src\/ruim\.ts \(1\)\nFALHOU — lint \(staged\): 2 arquivo\(s\), 1 erro\(s\), 0 aviso\(s\)\./u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('muitos arquivos (vários lotes) dão o mesmo resultado que um lote só', () => {
  const root = repo()
  try {
    const files = []
    for (let i = 0; i < 60; i += 1) { const rel = `src/gerado/arquivo-com-nome-bem-comprido-${String(i)}.ts`; put(root, rel, i % 7 === 0 ? BAD : CLEAN); files.push(rel) }
    const problems = runLint({ root, files })
    assert.equal(problems.length, 9) // i = 0,7,...,56
    assert.equal(new Set(problems.map(p => p.file)).size, 9)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('CLI: 0 PASSOU, 1 FALHOU com o erro impresso, --quiet cala o que passa, --json e --report', () => {
  const root = repo()
  try {
    const clean = cli(root)
    assert.equal(clean.status, 0, clean.stdout + clean.stderr)
    assert.match(clean.stdout, /^PASSOU — lint \(staged\): 0 arquivo\(s\), 0 erro\(s\)/mu)
    put(root, 'src/ruim.ts', BAD)
    const fail = cli(root)
    assert.equal(fail.status, 1)
    assert.match(fail.stdout, /FALHOU \[lint\] src\/ruim\.ts:2:3/u)
    assert.equal(cli(root, '--files', 'src/limpo.ts', '--quiet').stdout, '')
    const json = JSON.parse(cli(root, '--json').stdout)
    assert.equal(json.ok, false)
    assert.equal(json.errors, 1)
    const report = join(root, 'rel.json')
    cli(root, '--report', report, '--quiet')
    assert.equal(JSON.parse(readFileSync(report, 'utf8')).errors, 1)
    // --staged só vê o index: o arquivo ruim ainda não foi para lá
    assert.equal(cli(root, '--staged').status, 0)
    git(root, 'add', 'src/ruim.ts')
    assert.equal(cli(root, '--staged').status, 1)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('CLI: --config de outro arquivo é respeitado', () => {
  const root = repo()
  try {
    put(root, 'outro.json', JSON.stringify({ rules: { 'no-debugger': 'off', 'no-var': 'error' } }))
    put(root, 'src/x.ts', BAD)
    assert.equal(cli(root, '--files', 'src/x.ts').status, 1) // config padrão: debugger é erro
    assert.equal(cli(root, '--files', 'src/x.ts', '--config', 'outro.json').status, 0) // outro config: debugger não é regra
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('arquivos em ignorePatterns (ex.: só um .mjs mudou) NÃO viram "oxlint quebrado": passam; num lote misto o erro do outro aparece', () => {
  const root = repo()
  try {
    put(root, '.oxlintrc.staged.json', JSON.stringify({ rules: { 'no-debugger': 'error' }, ignorePatterns: ['src/ign/**'] }))
    put(root, 'src/ign/b.ts', BAD)
    const onlyIgnored = cli(root, '--files', 'src/ign/b.ts')
    assert.equal(onlyIgnored.status, 0, onlyIgnored.stdout + onlyIgnored.stderr) // "No files found to lint" do oxlint, sem o --no-error-on-unmatched-pattern, daria 1
    assert.match(onlyIgnored.stdout, /^PASSOU/mu)
    put(root, 'src/a.ts', BAD)
    const mixed = cli(root, '--files', 'src/ign/b.ts', 'src/a.ts')
    assert.equal(mixed.status, 1)
    assert.match(mixed.stdout, /FALHOU \[lint\] src\/a\.ts:2:3/u)
    assert.doesNotMatch(mixed.stdout, /ign\/b\.ts/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('arquivo passado de forma EXPLÍCITA é lintado mesmo no .gitignore (staging em .maestri/ funciona sem --no-ignore)', () => {
  const root = repo()
  try {
    put(root, '.gitignore', 'escondido/\n')
    put(root, 'escondido/y.ts', BAD)
    assert.deepEqual(collectFiles({ root }), []) // o modo padrão (git) não os vê
    assert.equal(cli(root, '--files', 'escondido/y.ts').status, 1) // mas --files sim
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('CLI: uso errado, config inexistente e oxlint quebrado saem com 2 (nunca viram PASSOU)', () => {
  const root = repo()
  try {
    assert.equal(cli(root, 'solto').status, 2)
    assert.equal(cli(root, '--root').status, 2)
    assert.equal(cli(root, '--files', 'src/nao-existe.ts').status, 2)
    put(root, 'src/ruim.ts', BAD)
    assert.equal(cli(root, '--config', 'nao-existe.json').status, 2)
    put(root, 'falso-oxlint.js', 'process.stderr.write("boom"); process.exit(3)\n')
    const broken = cli(root, '--oxlint', join(root, 'falso-oxlint.js'))
    assert.equal(broken.status, 2)
    assert.match(broken.stderr, /o oxlint saiu com 3: boom/u)
    put(root, 'falso-calado.js', 'process.exit(1)\n') // diz que achou problema mas não lista nenhum
    const silent = cli(root, '--oxlint', join(root, 'falso-calado.js'))
    assert.equal(silent.status, 2)
    assert.match(silent.stderr, /falhou sem listar problemas/u)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('parseArgs: valores, --files com pasta, estrito', () => {
  const args = parseArgs(['--files', 'a.ts', 'b', '--base', 'main', '--staged', '--no-ignore'])
  assert.deepEqual(args.files, ['a.ts', 'b'])
  assert.equal(args.base, 'main')
  assert.equal(args.flags.has('staged'), true)
  assert.throws(() => parseArgs(['--config']), UsageError)
  assert.throws(() => parseArgs(['solto']), UsageError)
})

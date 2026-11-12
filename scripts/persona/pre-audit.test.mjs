// node --test scripts/persona/pre-audit.test.mjs
// Sem vitest de verdade: o runner é injetado e a pasta é uma árvore sintética numa pasta temporária.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { GROUPS, parseArgs, parseVitest, plan, renderReport, renderTable, runPlan, statusOf, summarize } from './pre-audit.mjs'

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'pre-audit.mjs')
const RM = { recursive: true, force: true }
const GREEN = ' RUN  v4.1.11 C:/x\n\n Test Files  1 passed (1)\n      Tests  13 passed (13)\n   Start at  12:00:00\n'
const RED = ' FAIL  |thread-safe| tests/a.spec.ts > o teste que falha\nAssertionError: x\n\n Test Files  1 failed (1)\n      Tests  1 failed | 3 passed (4)\n'
const SKIPPED = ' Test Files  1 skipped (1)\n      Tests  5 skipped (5)\n'

test('parseVitest lê passou/falhou/pulado e o nome do teste que falhou (com cores ANSI no meio)', () => {
  assert.deepEqual(parseVitest(GREEN).tests, { passed: 13, failed: 0, skipped: 0, total: 13 })
  const red = parseVitest(`\u001b[31m${RED}\u001b[39m`)
  assert.deepEqual(red.tests, { passed: 3, failed: 1, skipped: 0, total: 4 })
  assert.deepEqual(red.failures, ['tests/a.spec.ts > o teste que falha']) // arquivo > nome, como o vitest escreve
  assert.deepEqual(parseVitest(SKIPPED).tests, { passed: 0, failed: 0, skipped: 5, total: 5 })
  assert.equal(parseVitest('Error: Cannot find module').hasSummary, false)
})

test('statusOf: PASSOU só com teste que RODOU e passou; tudo pulado é PULADO (nunca PASSOU); falha, saída ruim e sem resumo são FALHOU', () => {
  assert.equal(statusOf(parseVitest(GREEN), 0), 'PASSOU')
  assert.equal(statusOf(parseVitest(SKIPPED), 0), 'PULADO')
  assert.equal(statusOf(parseVitest(RED), 1), 'FALHOU')
  assert.equal(statusOf(parseVitest(GREEN), 1), 'FALHOU', 'o código de saída manda mesmo com resumo verde')
  assert.equal(statusOf(parseVitest('Error: Cannot find module'), 0), 'FALHOU', 'sem resumo o vitest quebrou antes de rodar')
  assert.equal(statusOf(parseVitest(' Test Files  1 passed (1)\n      Tests  0 passed (0)\n'), 0), 'FALHOU', 'zero testes não é prova')
})

function fakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'pre-audit-'))
  const put = (rel) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), '') }
  put('t/a.spec.ts')
  put('t/b.spec.ts')
  put('e2e/regressao-p0-01-x.spec.ts')
  put('e2e/regressao-p0-02-y.spec.ts')
  put('e2e/outro.spec.ts')
  return root
}
const FAKE_GROUPS = [
  { id: 'g1', label: 'Grupo 1', dir: 't', files: ['a.spec.ts', 'sumiu.spec.ts'] },
  { id: 'reg', label: 'Regressões', dir: 'e2e', pattern: /^regressao-p0-.+\.spec\.ts$/u },
]

test('plan: lista exata + descoberta por padrão; o arquivo que sumiu aparece como inexistente; o padrão só pega o que casa', () => {
  const root = fakeRepo()
  try {
    const rows = plan(root, FAKE_GROUPS)
    assert.deepEqual(rows.map((row) => `${row.file}:${String(row.exists)}`), ['t/a.spec.ts:true', 't/sumiu.spec.ts:false', 'e2e/regressao-p0-01-x.spec.ts:true', 'e2e/regressao-p0-02-y.spec.ts:true'])
  } finally { rmSync(root, RM) }
})

test('runPlan roda UM de cada vez, em ordem, e o ausente reprova sem rodar nada; um arquivo falhando não impede os seguintes', () => {
  const root = fakeRepo()
  try {
    const order = []
    const outputs = { 't/a.spec.ts': { output: GREEN, exitCode: 0 }, 'e2e/regressao-p0-01-x.spec.ts': { output: RED, exitCode: 1 }, 'e2e/regressao-p0-02-y.spec.ts': { output: SKIPPED, exitCode: 0 } }
    let running = 0
    let peak = 0
    const { rows, ok } = runPlan(plan(root, FAKE_GROUPS), {
      run: (row) => { running += 1; peak = Math.max(peak, running); order.push(row.file); running -= 1; return { ...outputs[row.file], ms: 1200, timedOut: false } },
    })
    assert.equal(peak, 1, 'nunca dois ao mesmo tempo')
    assert.deepEqual(order, ['t/a.spec.ts', 'e2e/regressao-p0-01-x.spec.ts', 'e2e/regressao-p0-02-y.spec.ts'], 'o ausente não foi rodado')
    assert.deepEqual(rows.map((row) => row.status), ['PASSOU', 'AUSENTE', 'FALHOU', 'PULADO'])
    assert.equal(ok, false)
    assert.match(rows[1].detail, /não existe/u)
    assert.match(rows[2].detail, /o teste que falha/u)
    assert.deepEqual(summarize(rows), { total: 4, passou: 1, falhou: 1, pulado: 1, ausente: 1, testes: 16 })
  } finally { rmSync(root, RM) }
})

test('tudo verde (com PULADO) = ok; estouro de tempo é FALHOU', () => {
  const rows = [{ group: 'g', label: 'G', file: 't/a.spec.ts', exists: true }, { group: 'g', label: 'G', file: 't/b.spec.ts', exists: true }]
  const green = runPlan(rows, { run: (row) => (row.file.endsWith('a.spec.ts') ? { output: GREEN, exitCode: 0, ms: 10, timedOut: false } : { output: SKIPPED, exitCode: 0, ms: 10, timedOut: false }) })
  assert.equal(green.ok, true)
  const timedOut = runPlan(rows.slice(0, 1), { run: () => ({ output: '', exitCode: 124, ms: 5, timedOut: true }) })
  assert.equal(timedOut.ok, false)
  assert.match(timedOut.rows[0].detail, /estourou o tempo/u)
})

test('renderTable e renderReport: tabela por arquivo, veredito, contagens e as notas coladas no fim', () => {
  const rows = [
    { group: 'acl', label: 'ACL', file: 'p/remote-acl.spec.ts', exists: true, status: 'PASSOU', tests: { passed: 13, failed: 0, skipped: 0, total: 13 }, failures: [], ms: 4000, detail: '' },
    { group: 'acl', label: 'ACL', file: 'p/x.spec.ts', exists: false, status: 'AUSENTE', tests: { passed: 0, failed: 0, skipped: 0, total: 0 }, failures: [], ms: 0, detail: 'o arquivo da lista não existe' },
  ]
  const table = renderTable(rows)
  assert.match(table, /\| acl .*\| remote-acl\.spec\.ts .*\| PASSOU .*\| 13\/13 .*\| 4s/u)
  assert.match(table, /AUSENTE .*\| - /u)
  const report = renderReport({ rows, notes: 'TEXTO DAS NOTAS', head: 'abc1234567', at: '2026-11-12 12:30' })
  assert.match(report, /HEAD abc1234567/u)
  assert.match(report, /PRE_AUDIT failing \(0 falhou, 1 ausente\)/u)
  assert.match(report, /## Notas para o Carbon \(cole\)\n\nTEXTO DAS NOTAS$/u)
  assert.match(renderReport({ rows: rows.slice(0, 1), notes: undefined, head: undefined, at: 'x' }), /PRE_AUDIT ok/u)
})

test('o plano de VERDADE: os arquivos que o Keel pediu estão na lista (e existem na árvore); o grupo regressao-p0 descobre os specs do persona-e2e', () => {
  const rows = plan()
  const names = rows.map((row) => row.file.split('/').pop())
  for (const wanted of ['remote-acl.spec.ts', 'remote-acl-matrix.spec.ts', 'remote-acl-write-guard.spec.ts', 'cross-project-reads.host.spec.ts', 'r2-conversation-acl.host.spec.ts', 'memory-dm-privacy.host.spec.ts', 'dm-canvas-approvals.host.spec.ts', 'd113-off-for-real.host.spec.ts', 'surface-table-complete.spec.ts', 'stream-revoke.host.spec.ts', 'command-policy.spec.ts']) assert.ok(names.includes(wanted), `falta ${wanted} no plano`)
  assert.deepEqual(rows.filter((row) => !row.exists).map((row) => row.file), [], 'todo arquivo do plano existe na árvore (senão a pré-auditoria reprova)')
  assert.ok(rows.filter((row) => row.group === 'regressoes').length >= 5)
  assert.equal(new Set(rows.map((row) => row.file)).size, rows.length, 'nenhum arquivo duas vezes')
  assert.ok(GROUPS.every((group) => group.files !== undefined || group.pattern !== undefined))
})

test('CLI de verdade: --list mostra o plano e sai 0 quando tudo existe; --only filtra; uso errado = 2', () => {
  const list = spawnSync(process.execPath, [CLI, '--list'], { encoding: 'utf8' })
  assert.equal(list.status, 0, list.stdout + list.stderr)
  assert.match(list.stdout, /ok +acl-papel +packages\/persona\/persona-host\/tests\/remote-acl\.spec\.ts/u)
  const only = spawnSync(process.execPath, [CLI, '--list', '--only', 'stream-revoke'], { encoding: 'utf8' })
  assert.equal(only.stdout.trim().split('\n').length, 1)
  assert.equal(spawnSync(process.execPath, [CLI, '--list', '--only', 'nada-disso'], { encoding: 'utf8' }).status, 2)
  assert.equal(spawnSync(process.execPath, [CLI, '--only'], { encoding: 'utf8' }).status, 2) // valor faltando
  assert.throws(() => parseArgs(['--only']), /precisa de um valor/u)
  assert.throws(() => parseArgs(['solto']), /argumento inesperado/u)
})

test('as notas existem, e o arquivo de notas é o que o relatório cola', () => {
  const notes = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pre-audit-notas.md'), 'utf8')
  assert.match(notes, /SUPERFÍCIE LIGADA/u)
  assert.match(notes, /d113-off-for-real/u)
  assert.match(notes, /cross-project-reads/u)
})

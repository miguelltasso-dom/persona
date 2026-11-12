#!/usr/bin/env node
// PRÉ-AUDITORIA DA SUPERFÍCIE LIGADA (Gauge, a pedido do Keel 12/11): roda JUNTAS as verificações independentes que a auditoria final do Carbon vai conferir, UM ARQUIVO POR VEZ pela trava `check`
// (nunca em paralelo: a máquina é compartilhada e o Probe tem a vez do bundle/e2e), e imprime uma tabela PASSOU/FALHOU por arquivo mais o texto das --notas pronto para colar.
//
//   node scripts/persona/pre-audit.mjs                 (roda tudo; ~20-40 arquivos, alguns minutos)
//   node scripts/persona/pre-audit.mjs --list          (só mostra o plano: quais arquivos, quais ausentes)
//   node scripts/persona/pre-audit.mjs --only acl      (só os arquivos cujo grupo ou nome contém o texto)
//   --notes <arquivo.md> (padrão scripts/persona/pre-audit-notas.md) · --out <pasta> (padrão .maestri/tmp/pre-audit) · --no-lock (sem a trava: só para quem JÁ está dentro dela) · --timeout-min <n> (por arquivo, inclui a espera da trava; padrão 30)
// Resultado por arquivo: PASSOU (testes rodaram e passaram) · FALHOU (algum teste falhou, ou o vitest saiu com erro) · PULADO (tudo pulado: o spec exige CLI/Chrome reais; nunca conta como PASSOU) · AUSENTE (o arquivo da lista não existe:
// foi renomeado ou apagado, e isso reprova: uma verificação que some em silêncio não prova nada). Saída 0 = nenhum FALHOU/AUSENTE; 1 = algum; 2 = uso errado. A rodada também vai para <out>/pre-audit-<data>.md e .json.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..', '..')
const HOST = 'packages/persona/persona-host/tests'
const RUNNERS = 'packages/persona/persona-runners/tests'
const E2E = 'packages/persona/persona-e2e/tests'

/** O plano: grupos de arquivos EXATOS (a lista é a decisão do Keel; um nome que some reprova) e um grupo descoberto por padrão (`regressao-p0-*`). */
export const GROUPS = [
  { id: 'acl-papel', label: 'ACL por papel × Remote', dir: HOST, files: ['remote-acl.spec.ts', 'remote-acl-matrix.spec.ts', 'remote-acl-write-guard.spec.ts', 'p0-13-acl.host.spec.ts', 'p0-13-dm-surfaces.host.spec.ts', 'acceptance-dm-write-acl.host.spec.ts'] },
  { id: 'acl-projeto', label: 'ACL por projeto, conversa e DM', dir: HOST, files: ['cross-project-reads.host.spec.ts', 'r2-conversation-acl.host.spec.ts', 'memory-dm-privacy.host.spec.ts', 'dm-canvas-approvals.host.spec.ts', 'mandatory-integration.host.spec.ts', 'mandatory-dm-derived.host.spec.ts'] },
  { id: 'stream', label: 'Revogação com stream aberto', dir: HOST, files: ['stream-revoke.host.spec.ts'] },
  { id: 'd113', label: 'Superfícies D-113 (desligado de verdade)', dir: HOST, files: ['d113-off-for-real.host.spec.ts', 'surface-gates.spec.ts', 'surface-table-complete.spec.ts', 'channels-surface-off.host.spec.ts'] },
  { id: 'comandos', label: 'Política de comandos e portão de permissões', dir: RUNNERS, files: ['command-policy.spec.ts', 'command-policy-bypass.spec.ts', 'command-policy-review-r2.spec.ts', 'permission-gate.spec.ts', 'permission-gate-ask-verbs.spec.ts', 'permission-gate-commands.spec.ts', 'permission-gate-wire.spec.ts'] },
  { id: 'regressoes', label: 'Regressões do Carbon em processo (regressao-p0-*)', dir: E2E, pattern: /^regressao-p0-.+\.spec\.ts$/u },
]

/** Os arquivos de cada grupo, com o caminho relativo à raiz e se existem. */
export function plan(root = REPO_ROOT, groups = GROUPS) {
  const rows = []
  for (const group of groups) {
    const names = group.files !== undefined ? group.files : listMatching(join(root, group.dir), group.pattern)
    for (const name of names) {
      const path = `${group.dir}/${name}`
      rows.push({ group: group.id, label: group.label, file: path, exists: existsSync(join(root, path)) })
    }
  }
  return rows
}

function listMatching(dir, pattern) {
  try { return readdirSync(dir).filter((name) => pattern.test(name)).sort() } catch { return [] }
}

const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/gu, '')

/** Lê o resumo do vitest: { files, tests: { passed, failed, skipped, total }, failures: [nomes] }. */
export function parseVitest(output) {
  const text = stripAnsi(output)
  const count = (line, word) => { const match = new RegExp(`(\\d+) ${word}`, 'u').exec(line ?? ''); return match === null ? 0 : Number(match[1]) }
  const testsLine = text.split(/\r?\n/u).find((line) => /^\s*Tests\s+\d/u.test(line))
  const filesLine = text.split(/\r?\n/u).find((line) => /^\s*Test Files\s+\d/u.test(line))
  const failures = []
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*(?:×|✗|FAIL)\s+(?:\|[^|]*\|\s+)?(.+?)(?:\s+\d+ms)?$/u.exec(line)
    if (match !== null && !failures.includes(match[1])) failures.push(match[1].slice(0, 160))
    if (failures.length >= 5) break
  }
  const passed = count(testsLine, 'passed')
  const failed = count(testsLine, 'failed')
  const skipped = count(testsLine, 'skipped')
  return { files: { passed: count(filesLine, 'passed'), failed: count(filesLine, 'failed'), skipped: count(filesLine, 'skipped') }, tests: { passed, failed, skipped, total: passed + failed + skipped }, failures, hasSummary: testsLine !== undefined || filesLine !== undefined }
}

/** PASSOU / FALHOU / PULADO a partir do resumo e do código de saída. Sem resumo = FALHOU (o vitest quebrou antes de rodar). */
export function statusOf(parsed, exitCode) {
  if (exitCode !== 0 || parsed.tests.failed > 0 || parsed.files.failed > 0) return 'FALHOU'
  if (!parsed.hasSummary) return 'FALHOU'
  if (parsed.tests.passed === 0) return parsed.tests.skipped > 0 ? 'PULADO' : 'FALHOU'
  return 'PASSOU'
}

/** Roda UM arquivo pela trava `check` (ou sem trava com `lock: false`). */
export function runFile({ root = REPO_ROOT, file, lock = true, timeoutMin = 30 }) {
  const vitest = [process.execPath, join(root, 'node_modules', 'vitest', 'vitest.mjs'), 'run', file]
  const args = lock ? [join(root, 'scripts', 'persona', 'with-lock.mjs'), `pre-audit ${file.split('/').pop()}`, '--lock', 'check', '--', ...vitest.slice(0)] : vitest.slice(1)
  const started = Date.now()
  const result = spawnSync(lock ? process.execPath : vitest[0], args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: timeoutMin * 60_000 })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return { exitCode: result.status ?? (result.error !== undefined ? 124 : 1), output, ms: Date.now() - started, timedOut: result.error?.code === 'ETIMEDOUT' }
}

/**
 * Executa o plano em ORDEM, um arquivo por vez. `run` é injetável (o teste não roda o vitest de verdade).
 * @returns {{ rows: any[], ok: boolean }}
 */
export function runPlan(rows, { run, onRow = () => undefined }) {
  const out = []
  for (const row of rows) {
    let result
    if (!row.exists) result = { ...row, status: 'AUSENTE', tests: { passed: 0, failed: 0, skipped: 0, total: 0 }, failures: [], ms: 0, detail: 'o arquivo da lista não existe (renomeado ou apagado?)' }
    else {
      const ran = run(row)
      const parsed = parseVitest(ran.output)
      const status = ran.timedOut ? 'FALHOU' : statusOf(parsed, ran.exitCode)
      const detail = ran.timedOut ? 'estourou o tempo (trava ocupada ou teste preso)' : status === 'FALHOU' ? (parsed.failures.length > 0 ? parsed.failures.join(' | ') : (stripAnsi(ran.output).trim().split(/\r?\n/u).slice(-2).join(' ').slice(0, 200) || `saiu com ${String(ran.exitCode)}`)) : status === 'PULADO' ? 'tudo pulado: exige CLI/Chrome reais (não conta como PASSOU)' : ''
      result = { ...row, status, tests: parsed.tests, failures: parsed.failures, ms: ran.ms, detail }
    }
    out.push(result)
    onRow(result)
  }
  return { rows: out, ok: out.every((row) => row.status !== 'FALHOU' && row.status !== 'AUSENTE') }
}

const pad = (text, width) => (text.length >= width ? text : text + ' '.repeat(width - text.length))

/** A tabela em markdown (também legível no terminal). */
export function renderTable(rows) {
  const header = ['Grupo', 'Arquivo', 'Resultado', 'Testes', 'Tempo', 'Detalhe']
  const body = rows.map((row) => [row.group, row.file.split('/').pop(), row.status, row.status === 'AUSENTE' ? '-' : `${String(row.tests.passed)}/${String(row.tests.total)}`, row.ms === 0 ? '-' : `${(row.ms / 1000).toFixed(0)}s`, row.detail ?? ''])
  const widths = header.map((title, index) => Math.max(title.length, ...body.map((line) => line[index].length)))
  const line = (cells) => `| ${cells.map((cell, index) => pad(cell, widths[index])).join(' | ')} |`
  return [line(header), `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`, ...body.map(line)].join('\n')
}

export function summarize(rows) {
  const count = (status) => rows.filter((row) => row.status === status).length
  return { total: rows.length, passou: count('PASSOU'), falhou: count('FALHOU'), pulado: count('PULADO'), ausente: count('AUSENTE'), testes: rows.reduce((sum, row) => sum + row.tests.passed, 0) }
}

export function renderReport({ rows, notes, head, at }) {
  const sum = summarize(rows)
  const verdict = sum.falhou === 0 && sum.ausente === 0 ? 'PRE_AUDIT ok' : `PRE_AUDIT failing (${String(sum.falhou)} falhou, ${String(sum.ausente)} ausente)`
  return [
    `# Pré-auditoria da superfície ligada (${at}${head === undefined ? '' : `, HEAD ${head}`})`,
    '',
    renderTable(rows),
    '',
    `${verdict} — ${String(sum.passou)} arquivo(s) PASSOU, ${String(sum.falhou)} FALHOU, ${String(sum.pulado)} PULADO, ${String(sum.ausente)} AUSENTE, de ${String(sum.total)}; ${String(sum.testes)} teste(s) passaram.`,
    '',
    '## Notas para o Carbon (cole)',
    '',
    notes ?? '(arquivo de notas não encontrado)',
  ].join('\n')
}

export function parseArgs(argv) {
  const args = { flags: new Set() }
  const withValue = new Set(['--only', '--notes', '--out', '--timeout-min'])
  for (let i = 0; i < argv.length; i += 1) {
    if (withValue.has(argv[i])) {
      if (i + 1 >= argv.length) throw new Error(`${argv[i]} precisa de um valor`)
      args[argv[i].slice(2)] = argv[++i]
    } else if (argv[i].startsWith('--')) args.flags.add(argv[i].slice(2))
    else throw new Error(`argumento inesperado: ${argv[i]}`)
  }
  return args
}

function main() {
  let args
  try { args = parseArgs(process.argv.slice(2)) } catch (error) { console.error(`uso: ${error.message}`); process.exit(2) }
  const timeoutMin = args['timeout-min'] === undefined ? 30 : Number(args['timeout-min'])
  if (!Number.isFinite(timeoutMin) || timeoutMin <= 0) { console.error('uso: --timeout-min precisa de um número positivo'); process.exit(2) }
  let rows = plan(REPO_ROOT)
  if (args.only !== undefined) rows = rows.filter((row) => `${row.group} ${row.file}`.includes(args.only))
  if (rows.length === 0) { console.error('nenhum arquivo no plano (--only demais?)'); process.exit(2) }
  if (args.flags.has('list')) {
    for (const row of rows) console.log(`${row.exists ? 'ok     ' : 'AUSENTE'}  ${row.group.padEnd(12)}  ${row.file}`)
    process.exit(rows.some((row) => !row.exists) ? 1 : 0)
  }
  const notesPath = resolve(args.notes ?? join(HERE, 'pre-audit-notas.md'))
  const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8').trim() : undefined
  const head = spawnSync('git', ['-C', REPO_ROOT, 'rev-parse', '--short=10', 'HEAD'], { encoding: 'utf8' }).stdout?.trim() || undefined
  const lock = !args.flags.has('no-lock')
  console.log(`[pre-audit] ${String(rows.length)} arquivo(s), UM por vez${lock ? ' pela trava check' : ' SEM trava'}; HEAD ${head ?? '?'}`)
  const { rows: done, ok } = runPlan(rows, {
    run: (row) => runFile({ root: REPO_ROOT, file: row.file, lock, timeoutMin }),
    onRow: (row) => console.log(`[pre-audit] ${pad(row.status, 7)} ${row.file.split('/').pop()} (${String(row.tests.passed)}/${String(row.tests.total)})${row.detail === '' ? '' : ` — ${row.detail}`}`),
  })
  const at = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const report = renderReport({ rows: done, notes, head, at })
  const outDir = resolve(args.out ?? join(REPO_ROOT, '.maestri', 'tmp', 'pre-audit'))
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/gu, '')
  writeFileSync(join(outDir, `pre-audit-${stamp}.md`), `${report}\n`)
  writeFileSync(join(outDir, `pre-audit-${stamp}.json`), `${JSON.stringify({ at, head, rows: done.map(({ label, ...rest }) => rest) }, null, 2)}\n`)
  console.log(`\n${report}`)
  console.log(`\n[pre-audit] relatório gravado em ${relative(REPO_ROOT, join(outDir, `pre-audit-${stamp}.md`)).split(sep).join('/')}`)
  process.exit(ok ? 0 : 1)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()

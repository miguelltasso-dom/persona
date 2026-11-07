#!/usr/bin/env node
/**
 * After `package-clean.mjs --commit <sha> --dir` finished OK (Rivet, 07/11): the verifier, then the NSIS Setup IN PARALLEL with the exe acceptance
 * (validate-exe + the vault loop), with one timeline. Each step that opens the app goes through the `build` lock; the NSIS step takes the `pack` lock itself.
 *
 *   node scripts/persona/pack-after-dir.mjs <full sha> [--go <iso time of the pack GO>] [--out <dir>] [--turn] [--vault-runs 20] [--priority]
 *                                           [--no-nsis] [--no-validate] [--no-vault] [--no-ht89] [--no-sharp] [--no-mingit] [--dry-run]
 *
 *   1. verify-persona-package.mjs <win-unpacked exe> --vault --light-only  -> proof.json (engineGate + vault + console clean; the NSIS step REQUIRES it)
 *   2. in parallel:  package-clean.mjs --commit <sha> --resume --proof <proof.json>   (Setup + install trial; sha256 of the Setup is computed here)
 *                    validate-exe.mjs <exe> --turn (BUG-QUIT-1)  ->  exe-vault-loop.mjs <exe> --runs 20 (INST-2)
 * Output: <out>/{proof,quit,vault}/..., <out>/timeline.json (the numbers Keel asks for: GO->win-unpacked, GO->Setup). `--priority` asks the build lock
 * to serve the steps ahead of the ordinary waiters (use it only when Keel says the cut is the critical path).
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const flagValue = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined }
const sha = args.find((item, index) => !item.startsWith('--') && !['--go', '--out', '--vault-runs'].includes(args[index - 1]))
if (sha === undefined || !/^[0-9a-f]{40}$/u.test(sha)) { console.error('usage: node scripts/persona/pack-after-dir.mjs <full 40-hex sha> [--go <iso>] [--out <dir>] [--turn] [--vault-runs 20] [--priority] [--no-nsis] [--no-validate] [--no-vault] [--dry-run]'); process.exit(2) }
const root = resolve(import.meta.dirname, '..', '..')
const cache = process.env.PERSONA_PACK_CACHE ?? 'C:\\p8c'
const dryRun = args.includes('--dry-run')
const withLock = (label, lockArgs, command) => [join(root, 'scripts', 'persona', 'with-lock.mjs'), label, '--lock', 'build', ...(args.includes('--priority') ? ['--priority'] : []), ...lockArgs, '--', ...command]

const reportPath = join(cache, 'package-clean.json')
const report = JSON.parse(readFileSync(reportPath, 'utf8'))
// The --dir report is overwritten by the NSIS step: its time is the instant win-unpacked was ready, so read it NOW.
const dirEndedAt = statSync(reportPath).mtimeMs
if (!dryRun && (report.ok !== true || report.commit !== sha || typeof report.exe !== 'string' || !existsSync(report.exe))) {
  console.error(`the last pack report is not a finished --dir of ${sha.slice(0, 10)}: ${JSON.stringify({ ok: report.ok, commit: String(report.commit).slice(0, 10), exe: report.exe })}`)
  process.exit(2)
}
const exe = typeof report.exe === 'string' ? report.exe : '<win-unpacked Persona.exe>'
const out = resolve(flagValue('--out') ?? join(root, '.maestri', 'tmp', 'rivet-cut'), sha.slice(0, 10))
const proofDir = join(out, 'proof')
const proofFile = join(proofDir, 'proof.json')
const goAt = flagValue('--go') === undefined ? undefined : Date.parse(String(flagValue('--go')))
const vaultRuns = flagValue('--vault-runs') ?? '20'
mkdirSync(out, { recursive: true })

const timeline = []
const stamp = () => new Date().toISOString().slice(11, 19)
const say = message => console.log(`[pack-after-dir ${stamp()}] ${message}`)
/** Run one step with its output in <out>/<name>.log; resolves with the exit code (a step that cannot start counts as a failure, never a throw). */
function step(name, argv, env = {}, command = process.execPath) {
  const startedAt = Date.now()
  say(`${name}: start`)
  if (dryRun) { say(`${name}: ${command} ${argv.join(' ')}`); timeline.push({ name, code: 0, startedAt, endedAt: startedAt, seconds: 0, dryRun: true }); return Promise.resolve(0) }
  return new Promise((done) => {
    const logFile = join(out, `${name}.log`)
    const chunks = []
    const child = spawn(command, argv, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } })
    child.stdout.on('data', chunk => chunks.push(chunk))
    child.stderr.on('data', chunk => chunks.push(chunk))
    const finish = (code) => {
      const endedAt = Date.now()
      writeFileSync(logFile, Buffer.concat(chunks))
      timeline.push({ name, code, startedAt, endedAt, seconds: Math.round((endedAt - startedAt) / 1000) })
      say(`${name}: ${code === 0 ? 'OK' : `EXIT ${String(code)}`} in ${String(Math.round((endedAt - startedAt) / 1000))} s (log ${logFile})`)
      done(code)
    }
    child.once('error', () => finish(1))
    child.once('close', code => finish(code ?? 1))
  })
}
function sha256(file) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256')
    createReadStream(file).on('data', chunk => hash.update(chunk)).on('error', reject).on('end', () => resolveHash(hash.digest('hex')))
  })
}

const result = { sha, exe, out, steps: timeline }
const verifier = await step('verificador', withLock(`Rivet verificador ${sha.slice(0, 10)}`, [],
  ['node', join(root, 'apps', 'desktop', 'scripts', 'verify-persona-package.mjs'), exe, proofDir, '--vault', '--light-only']))
if (verifier !== 0) { say('the verifier failed: no Setup, nothing else runs (see verificador.log)'); writeFileSync(join(out, 'timeline.json'), `${JSON.stringify({ ...result, ok: false }, null, 2)}\n`); process.exit(1) }
result.verifiedAt = Date.now()

const nsis = args.includes('--no-nsis') ? Promise.resolve(0)
  : step('nsis', [join(root, 'scripts', 'persona', 'package-clean.mjs'), '--commit', sha, '--resume', '--proof', proofFile])
// ISO-7 acceptance (Tally, persona-spec/reports/ht89-installed.md): the PACKAGED PermissionGate against the machine's real claude (fake Anthropic endpoint, no model, no
// login, 1-3 min), run INSIDE the exe's own node. It needs no window, so it takes the `check` lock and runs next to the UI steps. The result is kept with the pack's hash.
const ht89Probe = join(root, '.maestri', 'tmp', 'tally', 'ht89-installed', 'packaged-gate-probe.mjs')
const ht89 = args.includes('--no-ht89') || !(existsSync(ht89Probe) || dryRun) ? Promise.resolve(0)
  : step('ht89-instalado', [join(root, 'scripts', 'persona', 'with-lock.mjs'), 'Rivet ht89 instalado', '--lock', 'check', '--wait-max', '900000', '--', exe, ht89Probe,
    join(exe, '..', 'resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-persona-runners', 'lib', 'index.js'),
    '--out', join(root, 'persona-spec', 'reports', `ht89-installed-${sha.slice(0, 10)}.json`)], { ELECTRON_RUN_AS_NODE: '1' })
// Keel 15:22: the v1.1 image features need `sharp` (and its native binary, which lives OUTSIDE the asar) in the packaged runtime. Zero AI, no window, a few seconds.
const sharpCheck = args.includes('--no-sharp') ? Promise.resolve(0)
  : step('sharp-instalado', [join(root, 'scripts', 'persona', 'exe-sharp-probe.mjs')], { ELECTRON_RUN_AS_NODE: '1' }, exe)
// SW-4 / SW-5 on the INSTALLED build (PLAN: "falta validar no instalado"): the Git is the one inside the package and the review flow (prepare, apply, undo) works with it.
const mingitCheck = args.includes('--no-mingit') ? Promise.resolve(0)
  : step('mingit-instalado', [join(root, 'scripts', 'persona', 'exe-mingit-probe.mjs')], { ELECTRON_RUN_AS_NODE: '1' }, exe)
const acceptance = (async () => {
  let code = await sharpCheck + await mingitCheck
  if (!args.includes('--no-validate')) {
    code += await step('validate-exe', withLock(`Rivet validate-exe ${sha.slice(0, 10)}`, [], ['node', join(root, 'scripts', 'persona', 'bug-quit', 'validate-exe.mjs'), exe, join(out, 'quit'), ...(args.includes('--turn') ? ['--turn'] : [])]))
  }
  if (!args.includes('--no-vault')) {
    code += await step('laco-do-cofre', withLock(`Rivet laco do cofre ${sha.slice(0, 10)}`, [], ['node', join(root, 'scripts', 'persona', 'exe-vault-loop.mjs'), exe, join(out, 'vault'), '--runs', vaultRuns]))
  }
  return code + await ht89
})()
const [nsisCode, acceptanceCode] = await Promise.all([nsis, acceptance])

let setup
if (!args.includes('--no-nsis') && nsisCode === 0 && !dryRun) {
  const copy = join(cache, 'Persona-Setup.exe')
  if (existsSync(copy)) setup = { path: copy, sha256: await sha256(copy) }
}
const done = Date.now()
const reportAfter = args.includes('--no-nsis') || dryRun ? undefined : JSON.parse(readFileSync(join(cache, 'package-clean.json'), 'utf8'))
const summary = {
  ...result,
  ok: nsisCode === 0 && acceptanceCode === 0,
  nsisOk: nsisCode === 0,
  acceptanceOk: acceptanceCode === 0,
  setup: setup === undefined ? null : { ...setup, bytes: reportAfter?.setupBytes ?? null, installTrial: reportAfter?.trial ?? null },
  // GO -> win-unpacked = the instant the --dir report was written; GO -> Setup = the end of the NSIS step. Both need --go (the time the pack was started).
  goToWinUnpackedSeconds: goAt === undefined || Number.isNaN(goAt) ? null : Math.round((dirEndedAt - goAt) / 1000),
  goToSetupSeconds: goAt === undefined || Number.isNaN(goAt) || setup === undefined ? null : Math.round(((timeline.find(row => row.name === 'nsis')?.endedAt ?? done) - goAt) / 1000),
}
if (typeof report.elapsedMs === 'number') summary.dirPackSeconds = Math.round(report.elapsedMs / 1000)
writeFileSync(join(out, 'timeline.json'), `${JSON.stringify(summary, null, 2)}\n`)
say(`done: ${JSON.stringify({ ok: summary.ok, nsisOk: summary.nsisOk, acceptanceOk: summary.acceptanceOk, setup: summary.setup?.path, sha256: summary.setup?.sha256?.slice(0, 16), dirPackSeconds: summary.dirPackSeconds ?? null })}`)
process.exit(summary.ok ? 0 : 1)

#!/usr/bin/env node
// Persona publish gate (Keel; D-060): what must be green to publish on persona-dev.
//   1. generate-typert (host contracts the client types depend on)
//   2. check-pkg for EVERY packages/persona/* package (src + tests, one tsc per package)
//   3. build of the client bundle (client purity gate included)
//   4. boot smoke: clean temp home → onboarding → nine-panel tour (no ErrorState / no stuck Carregando…)
// The full-monorepo typecheck is NOT part of this gate (nightly/informative: scripts/persona/nightly-typecheck.mjs).
// Usage: node scripts/persona/persona-gate.mjs [--skip-smoke] [--skip-typert]
// Prints a last line `PERSONA_GATE ok` or `PERSONA_GATE failing=<packages> [smoke=fail]`; exit 0 only when everything is green.
// On success it writes .maestri/tmp/persona-gate-ok.json (tree hash) which the pre-push hook accepts for the same tree.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tokenGateStep } from './token-gate-step.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const skipSmoke = process.argv.includes('--skip-smoke')
const skipTypert = process.argv.includes('--skip-typert')
const run = (cmd, args, options = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, shell: process.platform === 'win32' && cmd === 'pnpm', ...options })
const log = (message) => console.log(`[persona-gate ${new Date().toISOString()}] ${message}`)
const NL = String.fromCharCode(10)

const failing = new Set()
let smokeFailed = false

if (!skipTypert) {
  const typert = run('pnpm', ['exec', 'tsx', 'scripts/generate-typert.ts'])
  const text = `${typert.stdout}${typert.stderr}`
  if (typert.status !== 0) {
    log(`generate-typert FAILED:${NL}${text.split(NL).filter((line) => /error|Typert/i.test(line)).slice(0, 6).join(NL)}`)
    for (const line of text.split(NL)) {
      const match = /(packages\/persona\/([^/\s:]+)\/)/u.exec(line)
      if (match !== null && /error|Typert/i.test(line)) failing.add(match[2])
    }
    if (failing.size === 0) failing.add('persona-host')
  } else log('generate-typert ok')
}

const packagesDir = join(root, 'packages', 'persona')
const names = readdirSync(packagesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(packagesDir, entry.name, 'package.json')))
  .map((entry) => entry.name)
const check = run('node', ['scripts/persona/check-pkg.mjs', ...names])
const checkText = `${check.stdout}${check.stderr}`
for (const line of checkText.split(NL)) {
  const match = /^(\S+): FAILED/u.exec(line.trim())
  if (match !== null) { failing.add(match[1]); log(line.trim()) }
}
const sample = checkText.split(NL).filter((line) => /error TS/.test(line)).slice(0, 8)
if (sample.length > 0) log(`first errors:${NL}${sample.join(NL)}`)
const failingFiles = new Set()
for (const line of checkText.split(NL)) {
  const match = /^\s*(packages\/persona\/[^\s(]+)\(\d+,\d+\): error TS/u.exec(line)
  if (match !== null) failingFiles.add(match[1])
}
if (failingFiles.size > 0) console.log(`PERSONA_FILES=${[...failingFiles].join(',')}`)
log(`check-pkg over ${names.length} packages: ${failing.size === 0 ? 'ok' : `failing = ${[...failing].join(', ')}`}`)

// OPT-2 token gate (Tally): informative by default; PERSONA_TOKEN_GATE=block makes it fail the gate. 60 s cap, never hangs the gate.
if (tokenGateStep({ run, log }).failed) failing.add('persona-engine')

const bundle = run('pnpm', ['--filter', '@deepseek-ai/dsh-client-ui-persona', 'run', 'bundle'])
if (bundle.status !== 0) {
  log(`client bundle FAILED:${NL}${`${bundle.stdout}${bundle.stderr}`.split(NL).filter((line) => /error|purity|Error/i.test(line)).slice(0, 6).join(NL)}`)
  // the bundler does not name the CSS file lightningcss rejects (check-pkg never sees CSS): find it and print it (04/11: three red cycles)
  const css = run('node', ['scripts/persona/find-bad-css.mjs'])
  if (css.status === 0 && css.stdout.trim() !== '[]') log(`CSS rejected by lightningcss (fix this file):${NL}${css.stdout.trim().slice(0, 700)}`)
  failing.add('client-ui-persona')
} else log('client bundle ok')

// D-071: the installer is packaged from a published commit, so the desktop host program must compile in every published tree
// (the gate used to check only packages/persona/*; the a1dccb5f8f installer failed in the host compiler for that reason).
const desktopTsc = run('pnpm', ['exec', 'tsc', '-p', 'apps/desktop/tsconfig.host.json', '--noEmit'], { timeout: 8 * 60_000 })
if (desktopTsc.status !== 0) {
  log(`apps/desktop typecheck FAILED:${NL}${`${desktopTsc.stdout}${desktopTsc.stderr}`.split(NL).filter((line) => /error TS/.test(line)).slice(0, 8).join(NL)}`)
  failing.add('apps-desktop')
} else log('apps/desktop host typecheck ok')

// WIRE-5 (Gauge): client<->host payload contract against the generated Typert schemas (~6 s, no browser). The spec fails on any NEW
// deviation outside its known-bug list. BLOCKING since 04/11 (zero known deviations); PERSONA_WIRE_CONTRACT=warn only logs WIRE_CONTRACT_WARN.
if (!skipTypert && existsSync(join(root, 'packages', 'persona', 'persona-e2e', 'tests', 'wire-contract.spec.ts'))) {
  const wire = run('pnpm', ['exec', 'vitest', 'run', 'packages/persona/persona-e2e/tests/wire-contract.spec.ts', '--testTimeout', '60000'], { timeout: 4 * 60_000 })
  if (wire.status === 0) log('wire contract: ok (no new deviation)')
  else {
    const tail = `${wire.stdout}${wire.stderr}`.split(NL).filter((line) => /WIRE-5|desvio|deviation|FAIL|AssertionError/i.test(line)).slice(0, 4).join(' | ')
    log(`WIRE_CONTRACT_WARN ${tail || `exit ${wire.status}`}`)
    if (process.env.PERSONA_WIRE_CONTRACT !== 'warn') failing.add('persona-e2e') // BLOCKING since 04/11 (Gauge: zero known deviations); PERSONA_WIRE_CONTRACT=warn makes it informative again
  }
}

// INSTALLER-GRADE (Atlas 04/11, after the H pack died in the host aggregate): the pack runs scripts/build.ts gates — Host/Client compilers
// plus BOTH aggregate checks (tsc -p tsconfig.host.json / tsconfig.client.json). `pnpm run typecheck` is that same scope. Cuts meant for an
// installer set PERSONA_GATE_INSTALLER=1 (or --installer) so the gate finds what the pack would find ~15 min later.
const installerMode = process.argv.includes('--installer') || process.env.PERSONA_GATE_INSTALLER === '1'
if (installerMode && failing.size === 0) {
  log('installer-grade: running the FULL typecheck (host + client aggregate checks, same scope the pack runs)')
  const full = run('pnpm', ['run', 'typecheck'], { timeout: 35 * 60_000 })
  const fullText = `${full.stdout}${full.stderr}`
  if (full.status !== 0) {
    const files = new Set()
    for (const line of fullText.split(NL)) {
      const match = /^\s*((?:packages|apps|scripts)\/[^\s(]+)\(\d+,\d+\): error TS/u.exec(line)
      if (match !== null) files.add(match[1])
    }
    if (files.size > 0) console.log(`PERSONA_FILES=${[...files].join(',')}`)
    log(`full typecheck FAILED (${files.size} file(s)):${NL}${fullText.split(NL).filter((line) => /error TS/.test(line)).slice(0, 8).join(NL)}`)
    failing.add('full-typecheck')
  } else log('full typecheck ok (host + client aggregate checks)')
}

const evalScan = run('node', ['scripts/persona/assert-client-no-eval.mjs'])
if (evalScan.status !== 0) {
  log(`client eval scan FAILED:${NL}${(evalScan.stdout + evalScan.stderr).trim()}`)
  failing.add('web-frontend')
} else log((evalScan.stdout + evalScan.stderr).trim() || 'client eval scan ok')

if (!skipSmoke && failing.size === 0) {
  const smoke = run(process.execPath, ['--import', 'tsx/esm', 'scripts/persona/persona-boot-smoke.mjs', '--root', root])
  log(`boot smoke: ${`${smoke.stdout}${smoke.stderr}`.trim().split(NL).slice(-3).join(' | ')}`)
  if (smoke.status !== 0) smokeFailed = true
  // Boot repeat (Gauge, 04/11): quick mode = 960x640 light+dark, 5 reloads each, own temp host (~2 min). INFORMATIVE by default
  // (BOOT_REPEAT_WARN line); PERSONA_BOOT_REPEAT=block makes a failure fail the gate. Runs inside the gate's exclusive window.
  if (!smokeFailed && existsSync(join(root, 'packages', 'persona', 'persona-e2e', 'tests', 'real-boot-repeat.spec.ts'))) {
    const repeat = run('pnpm', ['exec', 'vitest', 'run', 'packages/persona/persona-e2e/tests/real-boot-repeat.spec.ts', '--testTimeout', '300000', '--hookTimeout', '400000'], {
      env: { ...process.env, GAUGE_BOOT_CONFIGS: 'quick', PERSONA_E2E: '1' }, timeout: 10 * 60_000,
    })
    if (repeat.status === 0) log('boot repeat (quick): ok')
    else {
      const tail = `${repeat.stdout}${repeat.stderr}`.split(NL).filter((line) => /SlotAssemblyError|before any|FAIL|failed|Error/i.test(line)).slice(0, 4).join(' | ')
      log(`BOOT_REPEAT_WARN ${tail || `exit ${repeat.status}`}`)
      if (process.env.PERSONA_BOOT_REPEAT === 'block') smokeFailed = true
    }
  }
}

if (failing.size === 0 && !smokeFailed) {
  const tree = run('git', ['rev-parse', 'HEAD^{tree}']).stdout.trim()
  mkdirSync(join(root, '.maestri', 'tmp'), { recursive: true })
  writeFileSync(join(root, '.maestri', 'tmp', 'persona-gate-ok.json'), JSON.stringify({ tree, at: new Date().toISOString(), skippedSmoke: skipSmoke }))
  console.log('PERSONA_GATE ok')
  process.exit(0)
}
console.log(`PERSONA_GATE failing=${[...failing].join(',')}${smokeFailed ? ' smoke=fail' : ''}`)
process.exit(1)

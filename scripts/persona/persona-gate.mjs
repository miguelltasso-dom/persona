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

const bundle = run('pnpm', ['--filter', '@deepseek-ai/dsh-client-ui-persona', 'run', 'bundle'])
if (bundle.status !== 0) {
  log(`client bundle FAILED:${NL}${`${bundle.stdout}${bundle.stderr}`.split(NL).filter((line) => /error|purity|Error/i.test(line)).slice(0, 6).join(NL)}`)
  failing.add('client-ui-persona')
} else log('client bundle ok')

if (!skipSmoke && failing.size === 0) {
  const smoke = run(process.execPath, ['--import', 'tsx/esm', 'scripts/persona/persona-boot-smoke.mjs', '--root', root])
  log(`boot smoke: ${`${smoke.stdout}${smoke.stderr}`.trim().split(NL).slice(-3).join(' | ')}`)
  if (smoke.status !== 0) smokeFailed = true
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

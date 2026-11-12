#!/usr/bin/env node
/**
 * COLHEITA item 14 — the repeatable eval of the Padaria Lua round (Probe).
 *
 *   node scripts/persona/eval-padaria.mjs                         fake x 3 (0 AI): the TEAM-10 driver with stubs, N rounds, one summary
 *   node scripts/persona/eval-padaria.mjs --repeat 5              fake x 5
 *   node scripts/persona/eval-padaria.mjs --replay <home> [...]   evaluate homes a round already left (a real attempt, an older fake): no host, no model, no cost
 *   node scripts/persona/eval-padaria.mjs --strict                exit 1 unless EVERY round passed every check (default: report, exit 0)
 *   node scripts/persona/eval-padaria.mjs --d100                  the stub makes no hand-off of its own (no pass_forward / ask_colleague): the host's D-100 flow does the work
 *   node scripts/persona/eval-padaria.mjs --scenarios [ids]       one round per RED scenario (the stub does ONE thing wrong): pronto-falso, pergunta-boba, jargao, jargao-tecnico, pesado
 *
 * The REAL round is not run from here: it needs Atlas's written OK with a ceiling and goes through the TEAM-10 gate (mandatory-team-round.spec.ts).
 * Output: packages/persona/persona-e2e/artifacts/eval-padaria/eval-<engine>-<stamp>/summary.{md,json} (+ each round's own proof and home for the fake).
 * The fake takes the `build` lock (it starts the web host); a replay takes none.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const take = (flag) => {
  const index = args.indexOf(flag)
  if (index < 0) return undefined
  const value = args[index + 1]
  args.splice(index, value === undefined || value.startsWith('--') ? 1 : 2)
  return value === undefined || value.startsWith('--') ? '' : value
}
const flag = (name) => {
  const index = args.indexOf(name)
  if (index < 0) return false
  args.splice(index, 1)
  return true
}

const strict = flag('--strict')
const d100 = flag('--d100') // the stub makes no hand-off of its own: the host's D-100 flow does the work
const scenarios = take('--scenarios') // undefined = not asked; '' = all of them; 'jargao,pesado' = those
const engine = take('--engine') ?? 'fake'
const repeatText = take('--repeat') ?? '3'
const replayIndex = args.indexOf('--replay')
const replayHomes = replayIndex >= 0 ? args.slice(replayIndex + 1).filter(value => !value.startsWith('--')) : []

if (engine === 'real') {
  process.stderr.write('eval-padaria: the real round is not run from here. It needs Atlas\'s written OK with a ceiling and goes through the TEAM-10 gate (tests/mandatory-team-round.spec.ts).\n')
  process.exit(2)
}
if (engine !== 'fake') {
  process.stderr.write(`eval-padaria: unknown --engine "${engine}" (only "fake" runs from here)\n`)
  process.exit(2)
}

if (replayIndex >= 0) {
  if (replayHomes.length === 0) {
    process.stderr.write('eval-padaria: --replay needs at least one kept home\n')
    process.exit(2)
  }
  const { replayPadariaEval } = await import(pathToFileURL(resolve(root, 'packages', 'persona', 'persona-e2e', 'src', 'eval-padaria-run.ts')).href)
  const outcome = replayPadariaEval(replayHomes.map(home => resolve(home)))
  process.stdout.write(`${outcome.markdown}\nsummary: ${outcome.outDir}\n`)
  process.exit(strict && !outcome.summary.ok ? 1 : 0)
}

const repeat = Number(repeatText)
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) {
  process.stderr.write(`eval-padaria: --repeat must be a whole number from 1 to 10 (got "${repeatText}")\n`)
  process.exit(2)
}
const KNOWN_SCENARIOS = ['pronto-falso', 'pergunta-boba', 'jargao', 'jargao-tecnico', 'pesado']
const wanted = scenarios === undefined || scenarios === '' ? [] : scenarios.split(',').map(item => item.trim()).filter(Boolean)
const unknown = wanted.filter(item => !KNOWN_SCENARIOS.includes(item))
if (unknown.length > 0) {
  process.stderr.write(`eval-padaria: unknown scenario(s) ${unknown.join(', ')} (known: ${KNOWN_SCENARIOS.join(', ')})\n`)
  process.exit(2)
}
// --scenarios: ONE round of the fake per scenario, the stub doing one thing wrong each; the eval must flag exactly that. Without it: `--repeat` rounds of the clean fake.
const spec = scenarios === undefined ? 'eval-padaria-fake.spec.ts' : 'eval-padaria-scenarios.spec.ts'
const run = spawnSync(process.execPath, [
  resolve(root, 'scripts', 'persona', 'with-lock.mjs'), 'Probe eval Padaria (fake)', '--lock', 'build', '--wait-max', '3600000', '--',
  // The lock runs the command through a shell WITHOUT quoting: `process.execPath` ("C:\Program Files\nodejs\node.exe") would split at the space. Plain `node` and repo-relative paths (cwd = root).
  'node', 'scripts/persona/run-persona-e2e-vitest.mjs', `packages/persona/persona-e2e/tests/${spec}`,
], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env, PERSONA_EVAL: scenarios === undefined ? 'fake' : 'scenarios', PERSONA_EVAL_REPEAT: String(repeat), PERSONA_EVAL_STRICT: strict ? '1' : '0',
    PERSONA_EVAL_SCENARIOS: wanted.join(','), PERSONA_EVAL_CHOREOGRAPHY: d100 ? 'd100' : '',
  },
})
process.exit(run.status ?? 1)

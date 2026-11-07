// Runs ember-shell-shots.mjs once per (group, viewport, scheme) so every capture starts from its OWN clean host:
// recipes that decide seeded cards (the inbox proofs) must not see the leftovers of a previous capture, and
// the "empty" recipes need a host nobody seeded.
// Usage: node scripts/persona/ember-shell-shots-matrix.mjs <group> [<group>...]
//   a group is a comma-separated list of recipes that may share one host, e.g.
//   approvals-v2-empty,empty-org  routines,skills-empty  approvals-v2-batch  approvals-v2-flow
// (EMBER_AXE is passed through. EMBER_COMBOS="light:960x640,dark:zoom200" runs only those (scheme:viewport) pairs.)
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const shots = resolve(here, 'ember-shell-shots.mjs')
// A group may carry its own (scheme:viewport) pairs after '@', separated by '+' (or '|'; the pipe does not survive the Windows shell): approvals-v2-flow@light:960x640+dark:zoom200
const groups = process.argv.slice(2).map((arg) => {
  const [names = '', pairs] = arg.split('@')
  return { recipes: names.split(',').filter(name => name.length > 0), pairs: pairs === undefined ? undefined : new Set(pairs.split(/[|+]/u)) }
}).filter(group => group.recipes.length > 0)
if (groups.length === 0) { console.error('usage: ember-shell-shots-matrix.mjs <recipe[,recipe...]>...'); process.exit(2) }

const only = process.env.EMBER_COMBOS === undefined ? undefined : new Set(process.env.EMBER_COMBOS.split(',').map(item => item.trim()))
const VIEWPORTS = ['1440x900', '960x640', 'zoom200']
const SCHEMES = ['light', 'dark']
// One report for the whole matrix (each host appends to it); start clean.
// EMBER_OUT: another folder (the bundle-4 batch must not mix with the bundle-3 one the Muse already accepted); passes through to the hosts.
const outDir = process.env.EMBER_OUT ?? resolve(here, '../../.maestri/tmp/shots/ember/shell')
mkdirSync(outDir, { recursive: true })
rmSync(`${outDir}/report-all.json`, { force: true })
let hosts = 0
let failed = 0
for (const { recipes, pairs } of groups) {
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      if (only !== undefined && !only.has(`${scheme}:${viewport}`)) continue
      if (pairs !== undefined && !pairs.has(`${scheme}:${viewport}`)) continue
      hosts += 1
      const run = spawnSync(process.execPath, [shots, ...recipes], {
        stdio: 'inherit',
        env: { ...process.env, EMBER_VIEWPORT: viewport, EMBER_SCHEME: scheme },
      })
      if (run.status !== 0) { failed += 1; console.log(`[matrix] ${recipes.join('+')} ${scheme} ${viewport}: exit ${String(run.status)}`) }
    }
  }
}
console.log(`[matrix] ${String(hosts)} hosts, ${String(failed)} with problems`)
process.exit(failed > 0 ? 1 : 0)

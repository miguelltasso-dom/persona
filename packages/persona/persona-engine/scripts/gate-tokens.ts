/**
 * OPT-2 quick gate (persona-gate step): faithful scenarios vs the frozen baseline.
 * Exit 0 = pass. Prints the scenario table and one `TOKEN_GATE` summary line.
 * Refresh the baseline only with a recorded quality reason: `write-tokens-faithful.ts`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { faithfulSnapshot, formatFaithfulTable, gateFaithful, type FaithfulBaseline } from '../src/bench/token-gate.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const baselinePath = process.env.PERSONA_TOKEN_BASELINE ?? resolve(root, 'persona-spec/baselines/token-faithful.json')
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as FaithfulBaseline
const current = faithfulSnapshot()
const findings = gateFaithful(baseline, current)
process.stdout.write(`${formatFaithfulTable(current)}\n`)
if (findings.length > 0) {
  for (const finding of findings) process.stderr.write(`TOKEN_GATE ${finding.id} ${finding.reason}: ${finding.detail}\n`)
  process.stdout.write(`TOKEN_GATE failing=${[...new Set(findings.map(row => row.id))].join(',')}\n`)
  process.exit(1)
}
process.stdout.write('TOKEN_GATE ok\n')

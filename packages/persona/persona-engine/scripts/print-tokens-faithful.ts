/**
 * Print the faithful token tables for a report: scenarios (before/after), the lever ladder
 * of one scenario (default dia-padaria) and the prefix cache per engine. Usage:
 * `node --import tsx/esm packages/persona/persona-engine/scripts/print-tokens-faithful.ts [scenario]`
 */
import { FAITHFUL_SCENARIO_IDS, leverLadder, type FaithfulScenarioId } from '../src/bench/token-faithful.ts'
import { engineCacheTable, faithfulSnapshot, formatEngineCacheTable, formatFaithfulTable, formatWiringGainTable, wiringGainTable } from '../src/bench/token-gate.ts'

const wanted = process.argv[2] ?? 'dia-padaria'
const scenario = FAITHFUL_SCENARIO_IDS.find(id => id === wanted) as FaithfulScenarioId | undefined
if (scenario === undefined) throw new Error(`unknown scenario ${wanted}; use ${FAITHFUL_SCENARIO_IDS.join(', ')}`)

const out: string[] = ['## Cenários', '', formatFaithfulTable(faithfulSnapshot()), '', `## Escada de alavancas — ${scenario}`, '']
out.push('| alavanca | tokens antes → depois | custo µUSD antes → depois | chamadas | qualidade |', '|---|---:|---:|---:|---:|')
for (const step of leverLadder(scenario)) {
  const { before, after } = step
  out.push(`| ${step.lever} | ${String(before.totalTokens)} → ${String(after.totalTokens)} | ${String(before.costMicroUsd)} → ${String(after.costMicroUsd)} | ${String(before.calls)} → ${String(after.calls)} | ${before.quality.score.toFixed(2)} → ${after.quality.score.toFixed(2)} |`)
}
out.push('', '## O que ainda falta ligar no host (ganho marginal sobre hoje, dia-padaria)', '', formatWiringGainTable(wiringGainTable()))
out.push('', '## Cache do prefixo por motor (dia-padaria)', '', formatEngineCacheTable(engineCacheTable()), '')
process.stdout.write(`${out.join('\n')}\n`)

/** Fill persona-spec/baselines/token-scenarios.json from the scripted OPT-1 suite. */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runPairedSuite,
  runTokenScenario,
  TOKEN_SCENARIO_IDS,
} from '../../packages/persona/persona-engine/src/token-measure.ts'

const TOK_IDS = ['TOK-1', 'TOK-2', 'TOK-3', 'TOK-4', 'TOK-5'] as const
const LABELS: Record<(typeof TOKEN_SCENARIO_IDS)[number], string> = {
  'geral-simple': 'Pedido simples no #geral',
  'multi-review': 'Tarefa multi-etapa com revisão',
  'idle-routines': 'Dia ocioso com rotinas',
  'initiative-30': '30 personas com iniciativa',
  'padaria-lua': 'Dogfood Padaria Lua',
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dest = resolve(root, 'persona-spec/baselines/token-scenarios.json')

const scenarios = TOKEN_SCENARIO_IDS.map((engineId, index) => {
  const row = runTokenScenario(engineId)
  const inputTokens = row.entries.reduce((sum, entry) => sum + entry.inputTokens, 0)
  const outputTokens = row.entries.reduce((sum, entry) => sum + entry.outputTokens, 0)
  const cacheReadTokens = row.entries.reduce((sum, entry) => sum + entry.cacheReadTokens, 0)
  const cacheWriteTokens = row.entries.reduce((sum, entry) => sum + entry.cacheWriteTokens, 0)
  const tickets = new Set(row.entries.flatMap(entry => entry.ticketId === undefined ? [] : [entry.ticketId]))
  return {
    id: TOK_IDS[index],
    engineId,
    label: LABELS[engineId],
    tokensPerCompletedTask: tickets.size === 0 ? 0 : row.totalTokens / tickets.size,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    modelCalls: row.calls,
    cacheHitRate: row.cacheHitRate,
  }
})

const body = {
  version: 1,
  source: 'persona-spec/reports/tokens-baseline.md',
  engineIds: Object.fromEntries(TOKEN_SCENARIO_IDS.map((id, index) => [TOK_IDS[index], id])),
  regressionThresholdPercent: 10,
  status: 'scripted',
  origin: 'estimate',
  measuredAt: '2026-11-04T03:30:00.000Z',
  note: 'Forge scripted runners (persona-engine runTokenScenario). Probe owns the +10% gate. Idle and 30-persona initiative stay at 0 model calls.',
  tokensPerSuccessfulTask: 134,
  cacheHitRate: 0.63,
  scenarios,
  paired: runPairedSuite().map(row => ({
    id: row.taskId,
    cliTokens: row.cli.inputTokens + row.cli.outputTokens,
    personaTokens: row.persona.inputTokens + row.persona.outputTokens,
    tokenDeltaRatio: row.tokenDeltaRatio,
    verdict: row.verdict,
  })),
}

writeFileSync(dest, `${JSON.stringify(body, null, 2)}\n`)
process.stdout.write(`wrote ${dest}\n`)

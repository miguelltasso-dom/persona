/**
 * What ONE bare Claude CLI call costs on this machine, before any Persona prompt (D-070: "vendor base"). 3 calls to the same CLI the
 * paired run used (haiku), through `claude -p --output-format json`, which reports `num_turns` and the vendor's own `usage`:
 *   A  a trivial prompt                         → the base (system prompt + tool schemas + the user's memory/skills)
 *   B  a ~300-token NEUTRAL text + "answer only ok" → (B − A) ÷ our 4-chars estimate of the extra text = the tokenizer ratio.
 *      (The first B used a task prompt and the CLI worked on it for 4 requests, so it could not give a ratio. Neutral text, one request.)
 *   C  the trivial prompt again                  → how much of the base the provider cache gave back
 * `PAIR_REAL_BASE_ONLY=B-long` runs just that call and merges it into the existing report. It runs in an EMPTY directory, never touches the app or the user's data, and counts against the same 20-call cap as the pair run:
 * it refuses unless the pair run's limiter ledger says `turns + 3 ≤ 20`.
 *
 *   PERSONA_PAIR_REAL=1 PERSONA_REAL_E2E=1 PERSONA_REAL_TURN_CAP=20 PERSONA_REAL_TURN_LEDGER=<same abs path as the pair run> \
 *     node scripts/persona/with-lock.mjs "Tally real base" --lock real -- node --import tsx/esm packages/persona/persona-engine/scripts/pair-real-base.ts
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import { PAIR_REAL_CALL_CAP, assertRealRunGuards } from '../src/bench/pair-real.ts'
import { killProcessTree } from '../src/bench/coord-real-lifecycle.ts'

const BASE_CALLS = 3
const NEUTRAL = 'O armazém recebeu na segunda-feira doze caixas de farinha, quatro sacos de açúcar e uma remessa de ovos que precisou ser conferida duas vezes. '.repeat(8)
const CALL_MS = 120_000
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

interface RawCall {
  readonly label: 'A-trivial' | 'B-long' | 'C-trivial-again'
  readonly estimatedPromptTokens: number
  readonly numTurns: number | undefined
  readonly inputTokens: number | undefined
  readonly cacheCreationTokens: number | undefined
  readonly cacheReadTokens: number | undefined
  readonly outputTokens: number | undefined
  readonly durationMs: number | undefined
  readonly totalCostUsd: number | undefined
  readonly isError: boolean
}

function num(row: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = row?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function claude(prompt: string, cwd: string): Promise<Record<string, unknown>> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json', '--no-session-persistence', '--permission-mode', 'default'], {
      cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    })
    let out = ''
    let err = ''
    const timer = setTimeout(() => { killProcessTree(child.pid ?? 0); reject(new Error('claude -p timed out')) }, CALL_MS)
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString('utf8') })
    child.on('error', (error) => { clearTimeout(timer); reject(error) })
    child.on('close', () => {
      clearTimeout(timer)
      try {
        resolvePromise(JSON.parse(out) as Record<string, unknown>)
      } catch {
        reject(new Error(`claude -p gave no JSON: ${err.slice(0, 200) || out.slice(0, 200)}`))
      }
    })
  })
}

function rawOf(label: RawCall['label'], prompt: string, result: Record<string, unknown>): RawCall {
  const usage = (result.usage ?? undefined) as Record<string, unknown> | undefined
  return {
    label,
    estimatedPromptTokens: estimateTokens(prompt),
    numTurns: num(result, 'num_turns'),
    inputTokens: num(usage, 'input_tokens'),
    cacheCreationTokens: num(usage, 'cache_creation_input_tokens'),
    cacheReadTokens: num(usage, 'cache_read_input_tokens'),
    outputTokens: num(usage, 'output_tokens'),
    durationMs: num(result, 'duration_ms'),
    totalCostUsd: num(result, 'total_cost_usd'),
    isError: result.is_error === true,
  }
}

function totalInput(row: RawCall): number | undefined {
  if (row.inputTokens === undefined && row.cacheCreationTokens === undefined && row.cacheReadTokens === undefined) return undefined
  return (row.inputTokens ?? 0) + (row.cacheCreationTokens ?? 0) + (row.cacheReadTokens ?? 0)
}

async function main(): Promise<void> {
  const guards = assertRealRunGuards(process.env)
  let used = 0
  try {
    const ledger = JSON.parse(readFileSync(guards.ledger, 'utf8')) as { turns?: unknown }
    used = typeof ledger.turns === 'number' ? ledger.turns : 0
  } catch {
    throw new Error('the pair run ledger is not readable: this run counts against the same 20-call cap and will not start blind')
  }
  const only = process.env.PAIR_REAL_BASE_ONLY
  const reportPath = resolve(root, 'persona-spec/reports/pair-real-base.json')
  let calls: RawCall[] = []
  let earlier = 0
  if (only !== undefined) {
    calls = (JSON.parse(readFileSync(reportPath, 'utf8')) as { calls: RawCall[] }).calls
    earlier = calls.length
  }
  const wanted = only === undefined ? BASE_CALLS : 1
  // The base calls bypass the limiter, so they are counted here: the pair run's ledger + earlier base calls + these ≤ the 20-call cap.
  if (used + earlier + wanted > PAIR_REAL_CALL_CAP) throw new Error(`${String(used)} pair calls + ${String(earlier)} base calls + ${String(wanted)} would pass the ${String(PAIR_REAL_CALL_CAP)}-call cap`)
  const longPrompt = `${NEUTRAL}\n\nResponda apenas: ok`
  const trivial = 'Responda apenas: ok'
  const cwd = mkdtempSync(join(tmpdir(), 'persona-pair-base-'))
  try {
    for (const [label, prompt] of [['A-trivial', trivial], ['B-long', longPrompt], ['C-trivial-again', trivial]] as const) {
      if (only !== undefined && only !== label) continue
      const row = rawOf(label, prompt, await claude(prompt, cwd))
      calls = [...calls.filter(call => call.label !== label), row]
      process.stdout.write(`  ${label} turns=${String(row.numTurns)} in=${String(row.inputTokens)} cacheCreate=${String(row.cacheCreationTokens)} cacheRead=${String(row.cacheReadTokens)} out=${String(row.outputTokens)} ${String(row.durationMs)}ms\n`)
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
  calls.sort((x, y) => x.label.localeCompare(y.label))
  const a = calls.find(call => call.label === 'A-trivial')
  const b = calls.find(call => call.label === 'B-long')
  const c = calls.find(call => call.label === 'C-trivial-again')
  const baseA = a === undefined ? undefined : totalInput(a)
  const baseB = b === undefined ? undefined : totalInput(b)
  const extraEstimate = a === undefined || b === undefined ? 0 : b.estimatedPromptTokens - a.estimatedPromptTokens
  const derived = {
    vendorBaseTokens: baseA === undefined || a === undefined ? null : baseA - a.estimatedPromptTokens,
    tokenizerRatio: baseA === undefined || baseB === undefined || extraEstimate <= 0 ? null : Math.round(((baseB - baseA) / extraEstimate) * 1000) / 1000,
    baseServedFromCache: c?.cacheReadTokens === undefined ? null : c.cacheReadTokens > 0,
    singleRequest: calls.every(row => row.numTurns === 1),
    // the base moves between calls on this machine (memory, tool lists): both trivial calls, not one
    vendorBaseRange: [a, c].flatMap(row => (row === undefined || totalInput(row) === undefined ? [] : [totalInput(row)! - row.estimatedPromptTokens])),
  }
  writeFileSync(reportPath, `${JSON.stringify({ mode: 'real', calls, derived }, null, 2)}\n`)
  process.stdout.write(`wrote persona-spec/reports/pair-real-base.json ${JSON.stringify(derived)}\n`)
}

void main().catch((error: unknown) => {
  process.stderr.write(`pair-real-base refused/failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

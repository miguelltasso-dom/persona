import { expect, it } from 'vitest'
import {
  PAIR_TASKS,
  TOKEN_SCENARIO_BASELINES,
  TOKEN_SCENARIO_IDS,
  assertPairAcceptable,
  assertScenarioRegression,
  formatTokenMeasureReport,
  formatTokensBaselineMarkdown,
  measureEngineLevers,
  pairVerdict,
  runPairedSuite,
  runPairedTask,
  runPairArm,
  runTokenScenario,
  scorePairQuality,
} from '../src/token-measure.ts'
import type { PairArm, PairRunner, PairRunInput } from '../src/token-measure.ts'

function arm(overrides: Partial<PairArm> = {}): PairArm {
  return {
    path: 'cli_direct',
    engine: 'claude',
    model: 'haiku',
    inputTokens: 100,
    outputTokens: 20,
    cacheReadTokens: 0,
    cacheWriteTokens: 40,
    calls: 1,
    durationMs: 80,
    quality: 0.8,
    success: true,
    ...overrides,
  }
}

function fakeRunner(text: string): PairRunner {
  return {
    async start(input: PairRunInput) {
      return { runId: `${input.path}-${input.taskId}` }
    },
    stream() {
      return (async function* () {
        yield { text, inputTokens: 30, outputTokens: 8, cacheReadTokens: 0, cacheWriteTokens: 12 }
      })()
    },
    async cancel() { /* session closed */ },
    async dispose() { /* pool dropped */ },
  }
}

it('runs the five reference scenarios and gates a 10% regression', () => {
  for (const id of TOKEN_SCENARIO_IDS) {
    const report = runTokenScenario(id)
    expect(report.totalTokens).toBe(TOKEN_SCENARIO_BASELINES[id])
    assertScenarioRegression(TOKEN_SCENARIO_BASELINES[id], report.totalTokens)
  }
  expect(runTokenScenario('idle-routines').calls).toBe(0)
  expect(runTokenScenario('initiative-30').calls).toBe(0)
  expect(() => assertScenarioRegression(100, 112)).toThrow('TOKEN_REGRESSION')
  expect(() => assertScenarioRegression(100, 109)).not.toThrow()
  expect(() => assertScenarioRegression(100, 120, 0.2)).not.toThrow()
})

it('pairs CLI-direct vs Persona and allows extra spend only with a quality gain', () => {
  const suite = runPairedSuite()
  expect(suite).toHaveLength(PAIR_TASKS.length)
  for (const row of suite) {
    expect(row.cli.engine).toBe(row.persona.engine)
    expect(row.cli.model).toBe(row.persona.model)
    expect(row.cli.calls).toBe(1)
    expect(row.persona.calls).toBeGreaterThan(row.cli.calls)
    assertPairAcceptable(row)
  }
  expect(pairVerdict(arm(), arm({ path: 'persona', inputTokens: 108 }))).toBe('parity')
  expect(pairVerdict(arm(), arm({ path: 'persona', inputTokens: 90, quality: 0.8 }))).toBe('persona_better')
  expect(pairVerdict(arm(), arm({ path: 'persona', inputTokens: 140, quality: 1 }))).toBe('persona_justified')
  expect(pairVerdict(arm(), arm({ path: 'persona', inputTokens: 140, quality: 0.8 }))).toBe('persona_worse')
  expect(scorePairQuality('Standup no horario das 10h', ['horario'])).toBe(1)
})

it('runs a live pair through dispose + timeout and still folds usage', async () => {
  const cli = fakeRunner('horario do standup')
  const persona = fakeRunner('horario confirmado')
  const row = await runPairedTask(PAIR_TASKS[0]!, cli, persona, { real: true, turnMs: 2_000 })
  expect(row.cli.inputTokens).toBe(30)
  expect(row.persona.outputTokens).toBe(8)
  expect(row.cli.success).toBe(true)
  expect(row.persona.quality).toBe(1)
  const hung: PairRunner = {
    async start() { return { runId: 'hung' } },
    stream() {
      return (async function* () {
        await new Promise(() => { /* never emits */ })
      })()
    },
    async cancel() { /* cancelled on timeout */ },
  }
  await expect(runPairArm(hung, {
    path: 'cli_direct',
    taskId: 'simple-ask',
    prompt: 'x',
    engine: 'claude',
    model: 'haiku',
  }, 20)).rejects.toThrow(/timed out/)
})

it('prints a tokens-per-scenario report', () => {
  const text = formatTokenMeasureReport(
    TOKEN_SCENARIO_IDS.map(runTokenScenario),
    runPairedSuite(),
  )
  expect(text).toContain('tokens-per-scenario')
  expect(text).toContain('idle-routines\t0\t0')
  expect(text).toContain('paired')
  expect(text).toContain('simple-ask')
})

it('measures engine levers and writes the baseline markdown', () => {
  const levers = measureEngineLevers()
  expect(levers.prerouteAfterExpanded).toBeLessThan(levers.prerouteAfterLegacy)
  expect(levers.prerouteCorrect).toBe(levers.prerouteBeforeModelCalls)
  expect(levers.idleCalls).toBe(0)
  expect(levers.initiative30Calls).toBe(0)
  expect(levers.vigiaNeedsModel).toBe(false)
  expect(levers.channelWordsCapped).toBe(100)
  const md = formatTokensBaselineMarkdown()
  expect(md).toContain('linha de base')
  expect(md).toContain('geral-simple')
  expect(md).toContain('foldUsagePanel')
  expect(md).toContain('parity')
})

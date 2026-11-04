import { expect, it } from 'vitest'
import {
  PAIR_TASKS,
  TOKEN_SCENARIO_BASELINES,
  TOKEN_SCENARIO_IDS,
  assertPairAcceptable,
  assertScenarioRegression,
  formatOpt8AcceptanceMarkdown,
  formatTokenMeasureReport,
  formatTokensBaselineMarkdown,
  measureEngineLevers,
  measureOpt8Acceptance,
  measureOpt8View,
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
  // OPT-8 under D-068: one faithful pipeline, baseline levers-before-wiring, origin estimate.
  const opt8 = measureOpt8Acceptance()
  expect(opt8.failed).toEqual([])
  // D-080: cache-60 from what the provider reported on the real run, cut-40 on the view WITH the measured base, W3 deferred; parity still blocked.
  expect(opt8.blocked).toEqual(['pair-parity'])
  expect(opt8.passed).toBe(3)
  expect(opt8.total).toBe(4)
  expect(opt8.evidence.origin).toBe('calibrated')
  expect(opt8.evidence.calibration?.baseTokens).toBeGreaterThan(37_000)
  expect(opt8.evidence.calibration?.caveat).toContain('1 máquina, Haiku, 1 rodada real')
  expect(opt8.origin).toBe('calibrated')
  expect(opt8.baseline).toBe('levers-before-wiring')
  expect(opt8.evidence.cacheEstimate.filter(row => row.prefixHit !== null).every(row => (row.prefixHit ?? 0) >= 0.6)).toBe(true)
  expect(opt8.evidence.baseline).toBe('levers-before-wiring')
  expect(opt8.evidence.historical).toEqual({ id: 'historical-134-fixture', countsForGoal: false })
  expect(opt8.evidence.cut40.status).toBe('passed')
  expect(opt8.evidence.cut40.reason).toBe('goal-met')
  expect(opt8.evidence.cut40.costCut).toBeGreaterThanOrEqual(0.4)
  expect(opt8.evidence.cut40.tokensDelta).toBeLessThanOrEqual(0)
  expect(opt8.evidence.parity).toEqual({ status: 'blocked', reason: 'paired-run-inconclusive' })
  expect(opt8.evidence.providerCache).toMatchObject({ status: 'measured', origin: 'measured', engine: 'claude' })
  expect(opt8.evidence.providerCache.prefixHit).toBeGreaterThanOrEqual(0.6)
  expect(opt8.evidence.projectionAll.label).toBe('projection')
  // A live book is reported, but it never moves the goal and never compares with the 134 fixture.
  const emptyLayers = { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 10 }
  const book = [{
    id: 'e1',
    personaId: 'atlas',
    engine: 'claude',
    kind: 'execution' as const,
    inputTokens: 40,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    layers: emptyLayers,
    at: '2026-11-04T05:00:00.000Z',
    ticketId: 't1',
  }]
  const withBook = measureOpt8Acceptance({ successfulTicketIds: ['t1'], baselineTokensPerTask: 100, liveEntries: book })
  expect(withBook.blocked).toEqual(opt8.blocked)
  expect(withBook.failed).toEqual(opt8.failed)
  expect(withBook.passed).toBe(opt8.passed)
  const emptyView = measureOpt8View()
  expect(emptyView.blocked).toEqual(['pair-parity'])
  expect(emptyView.liveEntries).toBe(0)
  expect(emptyView.liveOrigin).toBe('estimate')
  const liveView = measureOpt8View(book)
  expect(liveView.blocked).toEqual(['pair-parity'])
  expect(liveView.passed).toBe(3)
  expect(liveView.liveEntries).toBe(1)
  expect(liveView.liveOrigin).toBe('estimate')
  expect(liveView.evidence.cut40.status).toBe('passed')
  expect(liveView.origin).toBe('calibrated')
  expect(liveView.baseline).toBe('levers-before-wiring')
  expect(measureOpt8View([{ ...book[0]!, id: 'e5', origin: 'measured' }]).liveOrigin).toBe('measured')
  const markdown = formatOpt8AcceptanceMarkdown()
  expect(markdown).toContain('blocked')
  expect(markdown).toContain('levers-before-wiring')
  expect(markdown).toContain('historical-134-fixture')
  expect(markdown).toContain('paired-run-inconclusive')
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

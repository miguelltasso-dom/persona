import { describe, expect, it } from 'vitest'
import {
  PAIR_REAL_CALL_CAP,
  assertRealRunGuards,
  buildPairRealPlan,
  calibrationFrom,
  formatPairRealMarkdown,
  inputOf,
  foldPairRealEvents,
  runPairReal,
  summarizePairReal,
  type PairRealEvent,
  type PairRealRunner,
  type PairRealStep,
} from '../src/bench/pair-real.ts'
import { WORKER_LEAN_REPORT_RULE } from '../src/prompts/templates.ts'
import { LEVERS_AS_WIRED } from '../src/bench/token-faithful.ts'

interface Spy {
  readonly runner: PairRealRunner
  readonly started: { prompt: string; step: PairRealStep }[]
  readonly cancelled: string[]
  disposed: number
}

function spyRunner(options: { usage?: PairRealEvent['usage']; usageOf?: (prompt: string) => PairRealEvent['usage']; hang?: boolean; text?: (prompt: string) => string } = {}): Spy {
  const spy: Spy = {
    started: [],
    cancelled: [],
    disposed: 0,
    runner: {
      async start(input) {
        spy.started.push({ prompt: input.prompt, step: input.step })
        return await Promise.resolve({ runId: `r${String(spy.started.length)}` })
      },
      stream() {
        const prompt = spy.started.at(-1)?.prompt ?? ''
        return (async function* (): AsyncGenerator<PairRealEvent> {
          if (options.hang === true) await new Promise<void>(() => { /* never ends */ })
          yield { type: 'delta', text: options.text?.(prompt) ?? 'ok' }
          const usage = options.usageOf?.(prompt) ?? options.usage
          if (usage !== undefined) yield { type: 'usage', usage }
          yield { type: 'ended', report: { summary: 'ended' } }
        })()
      },
      async cancel(handle) {
        spy.cancelled.push(handle.runId)
        await Promise.resolve()
      },
      async dispose() {
        spy.disposed += 1
        await Promise.resolve()
      },
    },
  }
  return spy
}

describe('paired real run plan', () => {
  it('stays inside the 20-call cap and pairs the same task on both arms', () => {
    const plan = buildPairRealPlan()
    expect(plan.callCount).toBe(plan.calls.length)
    expect(plan.callCount).toBeLessThanOrEqual(PAIR_REAL_CALL_CAP)
    expect(plan.cli).toBe('claude')
    expect(plan.model).toBe('haiku')
    const direct = plan.calls.filter(call => call.arm === 'cli_direct')
    const persona = plan.calls.filter(call => call.arm === 'persona')
    const lean = plan.calls.filter(call => call.arm === 'persona_lean')
    expect(plan.callCount).toBe(9)
    expect(direct).toHaveLength(2)
    expect(persona.map(call => call.step)).toEqual(['triage', 'execution', 'triage', 'execution', 'ttl_probe'])
    expect(lean.map(call => call.step)).toEqual(['execution', 'execution'])
    for (const call of direct) expect(call.prompt).toContain('Implemente o filtro de pedidos')
    expect(plan.calls.at(-1)?.pass).toBe('after_gap')
  })

  it('replays the prompts the faithful runner counts, with the same model on both arms', () => {
    const plan = buildPairRealPlan(LEVERS_AS_WIRED)
    const triage = plan.calls.find(call => call.step === 'triage')
    expect(triage?.prompt).toContain('Você é Atlas, Coordenação')
    // The host hands the worker its persona prompt and the ticket title, nothing else.
    const execution = plan.calls.find(call => call.arm === 'persona' && call.step === 'execution')
    expect(execution?.prompt.endsWith('Implemente o filtro de pedidos.')).toBe(true)
    expect(execution?.prompt).not.toContain('Critério de pronto')
    const warmTriage = plan.calls.filter(call => call.step === 'triage')[1]
    expect(warmTriage?.prompt.length).toBeLessThan(triage?.prompt.length ?? 0)
  })

  it('adds only the short-report rule on the lean arm, same title and persona', () => {
    const plan = buildPairRealPlan()
    const plain = plan.calls.find(call => call.arm === 'persona' && call.step === 'execution' && call.pass === 'cold')
    const lean = plan.calls.find(call => call.arm === 'persona_lean' && call.pass === 'cold')
    expect(lean?.prompt.length).toBeGreaterThan(plain?.prompt.length ?? 0)
    expect(lean?.prompt.endsWith('Implemente o filtro de pedidos.')).toBe(true)
    expect(plain?.prompt).not.toContain(WORKER_LEAN_REPORT_RULE)
    expect(lean?.prompt).toContain(WORKER_LEAN_REPORT_RULE)
  })
})

describe('running the plan', () => {
  it('runs every call, cancels each one and disposes once', async () => {
    const plan = buildPairRealPlan()
    const spy = spyRunner({ usage: { inputTokens: 40, outputTokens: 7, cacheReadTokens: 1000, cacheWriteTokens: 0 } })
    const slept: number[] = []
    const results = await runPairReal(spy.runner, plan, { sleep: async (ms) => { slept.push(ms); await Promise.resolve() }, gapMs: 123 })
    expect(results).toHaveLength(plan.callCount)
    expect(spy.started).toHaveLength(plan.callCount)
    expect(spy.cancelled).toHaveLength(plan.callCount)
    expect(spy.disposed).toBe(1)
    expect(slept).toEqual([123])
    expect(results.every(row => row.inputTokens === 40 && row.cacheReadTokens === 1000)).toBe(true)
  })

  it('never reports 0 for counters the adapter did not send', async () => {
    const results = await runPairReal(spyRunner().runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    for (const row of results) {
      expect(row.inputTokens).toBeUndefined()
      expect(row.cacheReadTokens).toBeUndefined()
    }
    const summary = summarizePairReal(results)
    expect(summary.vendorBaseEstimate).toBeNull()
    expect(summary.tokenizerRatio).toBeNull()
    expect(summary.cacheSurvivedGap).toBeNull()
    expect(formatPairRealMarkdown(results, 'dry')).toContain('n/d')
  })

  it('a hung turn is cancelled and the runner is still disposed', async () => {
    const spy = spyRunner({ hang: true })
    await expect(runPairReal(spy.runner, buildPairRealPlan(), { turnMs: 30, sleep: async () => { await Promise.resolve() } })).rejects.toThrow('timed out')
    expect(spy.cancelled.length).toBeGreaterThanOrEqual(1)
    expect(spy.disposed).toBe(1)
    expect(spy.started).toHaveLength(1)
  })

  it('refuses a plan over the cap before spending a call', async () => {
    const plan = buildPairRealPlan()
    const spy = spyRunner()
    const fat = { ...plan, callCount: PAIR_REAL_CALL_CAP + 1 }
    await expect(runPairReal(spy.runner, fat)).rejects.toThrow('PAIR_REAL_OVER_CAP')
    expect(spy.started).toHaveLength(0)
  })

  it('folds text from deltas (or the ended summary) and takes the last usage event', async () => {
    async function* events(): AsyncGenerator<PairRealEvent> {
      await Promise.resolve()
      yield { type: 'delta', text: 'a' }
      yield { type: 'delta', text: 'b' }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 3, cacheReadTokens: 9 } }
    }
    const folded = await foldPairRealEvents(events())
    expect(folded.text).toBe('ab')
    expect(folded.usage).toEqual({ inputTokens: 5, outputTokens: 3, cacheReadTokens: 9 })
    async function* onlyEnded(): AsyncGenerator<PairRealEvent> {
      await Promise.resolve()
      yield { type: 'ended', report: { summary: 'resumo' } }
    }
    expect((await foldPairRealEvents(onlyEnded())).text).toBe('resumo')
  })

  it('calibrates: vendor base, tokenizer ratio (WITHOUT the base) and cache across the gap', async () => {
    // a CLI that adds a 12 000-token base to every call and counts our text at 3 chars per token instead of 4
    const spy = spyRunner({ usageOf: prompt => ({ inputTokens: 12_000 + Math.ceil(prompt.length / 3), outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 }) })
    const results = await runPairReal(spy.runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    const summary = summarizePairReal(results)
    const direct = results.find(row => row.step === 'direct' && row.pass === 'cold')
    // the base is what the direct call carried beyond its own prompt (± the rounding of a 30-token prompt)
    expect(summary.vendorBaseEstimate).toBeGreaterThan(11_900)
    expect(summary.vendorBaseEstimate).toBeLessThan(12_100)
    expect(direct?.estimatedPromptTokens).toBeGreaterThan(0)
    // 4/3 more tokens than we estimated, not the ~100× the raw input would suggest
    expect(summary.tokenizerRatio).toBeGreaterThan(1.2)
    expect(summary.tokenizerRatio).toBeLessThan(1.5)
    expect(summary.cacheSurvivedGap).toBe(false)
    const warmCache = await runPairReal(spyRunner({ usage: { inputTokens: 50, outputTokens: 5, cacheReadTokens: 12_000 } }).runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    expect(summarizePairReal(warmCache).cacheSurvivedGap).toBe(true)
    expect(formatPairRealMarkdown(warmCache, 'real')).toContain('sim (TTL > 5 min)')
  })

  it('turns the run into the calibration estimateAsk takes: only what the CLI reported, ranges in seconds', async () => {
    const spy = spyRunner({ usageOf: prompt => ({ inputTokens: 9_000 + prompt.length, outputTokens: 20 }) })
    const results = await runPairReal(spy.runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    const timed = results.map((row, index) => ({ ...row, durationMs: 10_000 + index * 1_000 }))
    // the pair totals sum the CLI's inner requests: no base and no ratio come from them
    expect(calibrationFrom(timed).vendorBaseTokens).toBeUndefined()
    expect(calibrationFrom(timed).tokenizerRatio).toBeUndefined()
    const calibration = calibrationFrom(timed, { vendorBaseTokens: 37_724.4, tokenizerRatio: 1.7071 })
    expect(calibration.vendorBaseTokens).toBe(37_724)
    expect(calibration.tokenizerRatio).toBe(1.707)
    expect(calibration.secondsPerCall?.execucao?.min).toBeLessThanOrEqual(calibration.secondsPerCall?.execucao?.max ?? 0)
    expect(calibration.secondsPerCall?.triagem?.min).toBeGreaterThan(0)
    // nothing reported = nothing invented
    const none = await runPairReal(spyRunner().runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    const bare = calibrationFrom(none.map(row => ({ ...row, durationMs: 0 })))
    expect(bare.vendorBaseTokens).toBeUndefined()
    expect(bare.tokenizerRatio).toBeUndefined()
    expect(bare.secondsPerCall).toBeUndefined()
  })
})

describe('W3 calibration and the ready criterion', () => {
  it('compares the lean worker output against the plain one and checks both met the criterion', async () => {
    const spy = spyRunner({
      usage: { inputTokens: 100, outputTokens: 50 },
      text: prompt => (prompt.includes(WORKER_LEAN_REPORT_RULE) ? 'Resultado: filtro de pedidos pronto.' : 'Passo 1... Passo 2... Resultado: filtro de pedidos pronto.'),
    })
    const results = await runPairReal(spy.runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    const answers = results.filter(row => row.step === 'execution' || row.step === 'direct')
    expect(answers.every(row => row.ready === true)).toBe(true)
    expect(results.filter(row => row.step === 'triage' || row.step === 'ttl_probe').every(row => row.ready === undefined)).toBe(true)
    const summary = summarizePairReal(results)
    expect(summary.leanReadyHeld).toBe(true)
    // same scripted usage on both arms here, so the ratio is exactly 1: the harness only reports it
    expect(summary.leanOutputRatio).toBe(1)
    expect(formatPairRealMarkdown(results, 'dry')).toContain('W3 (relato curto)')
  })

  it('flags a lean answer that lost the criterion', async () => {
    const spy = spyRunner({
      usage: { inputTokens: 100, outputTokens: 5 },
      text: prompt => (prompt.includes(WORKER_LEAN_REPORT_RULE) ? 'Feito.' : 'Resultado: filtro pronto.'),
    })
    const results = await runPairReal(spy.runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    expect(summarizePairReal(results).leanReadyHeld).toBe(false)
  })
})

describe('the guards a REAL run needs before any paid turn', () => {
  const ok = {
    PERSONA_PAIR_REAL: '1', PERSONA_REAL_E2E: '1', PERSONA_LOCK: 'real',
    PERSONA_REAL_TURN_CAP: '20', PERSONA_REAL_TURN_LEDGER: process.platform === 'win32' ? 'C:\\temp\\pair-ledger.json' : '/tmp/pair-ledger.json',
  }

  it('passes with every guard in place and says which cap and ledger are in force', () => {
    expect(assertRealRunGuards(ok)).toEqual({ cap: 20, ledger: ok.PERSONA_REAL_TURN_LEDGER })
    expect(assertRealRunGuards({ ...ok, PERSONA_REAL_TURN_CAP: '9' }).cap).toBe(9)
  })

  it('refuses on the first missing guard: flags, the real lock, the limiter, a relative ledger', () => {
    const without = (key: keyof typeof ok, value?: string) => ({ ...ok, [key]: value })
    expect(() => assertRealRunGuards(without('PERSONA_PAIR_REAL'))).toThrow('PERSONA_PAIR_REAL=1')
    expect(() => assertRealRunGuards(without('PERSONA_REAL_E2E', '0'))).toThrow('PERSONA_REAL_E2E=1')
    expect(() => assertRealRunGuards(without('PERSONA_LOCK', 'check'))).toThrow('--lock real')
    expect(() => assertRealRunGuards(without('PERSONA_REAL_TURN_CAP'))).toThrow('PERSONA_REAL_TURN_CAP')
    expect(() => assertRealRunGuards(without('PERSONA_REAL_TURN_LEDGER'))).toThrow('absolute path')
    expect(() => assertRealRunGuards(without('PERSONA_REAL_TURN_LEDGER', 'ledger.json'))).toThrow('absolute path')
  })

  it('refuses a cap that is not a plain integer or is over the 20 calls Atlas allowed', () => {
    for (const bad of ['', '0', '-1', '1.5', 'abc', '1e3', '0x10', ' 5']) {
      expect(() => assertRealRunGuards({ ...ok, PERSONA_REAL_TURN_CAP: bad }), bad).toThrow('PERSONA_REAL_TURN_CAP')
    }
    expect(() => assertRealRunGuards({ ...ok, PERSONA_REAL_TURN_CAP: String(PAIR_REAL_CALL_CAP + 1) })).toThrow('over the 20-call cap')
  })
})

describe('the counters the OAR adapter reports', () => {
  const row = (extra: Partial<Parameters<typeof inputOf>[0]>): Parameters<typeof inputOf>[0] => ({
    arm: 'persona', step: 'execution', pass: 'cold', estimatedPromptTokens: 300, inputTokens: undefined, outputTokens: 5,
    cacheReadTokens: undefined, cacheWriteTokens: undefined, text: '', durationMs: 1, ready: undefined, ...extra,
  })

  it('reads inputTokens as the TOTAL when the cache counters fit inside it (measured on 04/11)', () => {
    expect(inputOf(row({ inputTokens: 305_652, cacheReadTokens: 299_762, cacheWriteTokens: 5_888 }))).toBe(305_652)
    expect(inputOf(row({ inputTokens: 93_627, cacheReadTokens: 0, cacheWriteTokens: 93_625 }))).toBe(93_627)
  })

  it('adds the cache counters only when they cannot be parts of the input (the adapter sent the uncached input alone)', () => {
    expect(inputOf(row({ inputTokens: 50, cacheReadTokens: 12_000 }))).toBe(12_050)
    expect(inputOf(row({ inputTokens: 100 }))).toBe(100)
    expect(inputOf(row({}))).toBeUndefined()
  })

  it('shows the warm pass of the short report next to the cold one', async () => {
    const spy = spyRunner({ usage: { inputTokens: 100, outputTokens: 40 }, text: () => 'Resultado: filtro pronto.' })
    const results = await runPairReal(spy.runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    const summary = summarizePairReal(results)
    expect(summary.leanOutputRatio).toBe(1)
    expect(summary.leanOutputRatioWarm).toBe(1)
    expect(formatPairRealMarkdown(results, 'real')).toContain('(fria)')
  })
})

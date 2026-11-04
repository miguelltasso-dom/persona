import { describe, expect, it } from 'vitest'
import {
  PAIR_REAL_CALL_CAP,
  buildPairRealPlan,
  formatPairRealMarkdown,
  foldPairRealEvents,
  runPairReal,
  summarizePairReal,
  withRealReport,
  type PairRealEvent,
  type PairRealRunner,
  type PairRealStep,
} from '../src/bench/pair-real.ts'
import { LEVERS_AS_WIRED } from '../src/bench/token-faithful.ts'

interface Spy {
  readonly runner: PairRealRunner
  readonly started: { prompt: string; step: PairRealStep }[]
  readonly cancelled: string[]
  disposed: number
}

function spyRunner(options: { usage?: PairRealEvent['usage']; hang?: boolean; text?: (prompt: string) => string } = {}): Spy {
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
          if (options.usage !== undefined) yield { type: 'usage', usage: options.usage }
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
    expect(direct).toHaveLength(2)
    expect(persona.map(call => call.step)).toEqual(['triage', 'execution', 'evaluation', 'triage', 'execution', 'evaluation', 'ttl_probe'])
    for (const call of direct) expect(call.prompt).toContain('Implemente o filtro de pedidos')
    expect(plan.calls.at(-1)?.pass).toBe('after_gap')
  })

  it('replays the prompts the faithful runner counts, with the same model on both arms', () => {
    const plan = buildPairRealPlan(LEVERS_AS_WIRED)
    const triage = plan.calls.find(call => call.step === 'triage')
    expect(triage?.prompt).toContain('Você é Atlas, Coordenação')
    const execution = plan.calls.find(call => call.step === 'execution')
    expect(execution?.prompt).toContain('Tarefa: Implementar o filtro de pedidos')
    const warmTriage = plan.calls.filter(call => call.step === 'triage')[1]
    expect(warmTriage?.prompt.length).toBeLessThan(triage?.prompt.length ?? 0)
  })

  it('swaps the scripted report for the real one only inside the evaluation prompt', () => {
    const replaced = withRealReport('Revisar...\nRelato da executora:\nroteiro', 'o que o modelo escreveu')
    expect(replaced).toBe('Revisar...\nRelato da executora:\no que o modelo escreveu')
    expect(withRealReport('sem marcador', 'x')).toBe('sem marcador')
  })
})

describe('running the plan', () => {
  it('runs every call, cancels each one, disposes once, and carries the real execution report forward', async () => {
    const plan = buildPairRealPlan()
    const spy = spyRunner({
      usage: { inputTokens: 40, outputTokens: 7, cacheReadTokens: 1000, cacheWriteTokens: 0 },
      text: prompt => (prompt.startsWith('Tarefa') || prompt.includes('Critério de pronto') ? 'RELATO-REAL-DA-EXECUCAO' : 'ok'),
    })
    const slept: number[] = []
    const results = await runPairReal(spy.runner, plan, { sleep: async (ms) => { slept.push(ms); await Promise.resolve() }, gapMs: 123 })
    expect(results).toHaveLength(plan.callCount)
    expect(spy.started).toHaveLength(plan.callCount)
    expect(spy.cancelled).toHaveLength(plan.callCount)
    expect(spy.disposed).toBe(1)
    expect(slept).toEqual([123])
    const evaluation = spy.started.find(call => call.step === 'evaluation')
    expect(evaluation?.prompt).toContain('RELATO-REAL-DA-EXECUCAO')
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

  it('calibrates: vendor base, tokenizer ratio and cache across the gap', async () => {
    const spy = spyRunner({ usage: { inputTokens: 12_500, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 } })
    const results = await runPairReal(spy.runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    const summary = summarizePairReal(results)
    const direct = results.find(row => row.step === 'direct' && row.pass === 'cold')
    expect(summary.vendorBaseEstimate).toBe(12_500 - (direct?.estimatedPromptTokens ?? 0))
    expect(summary.tokenizerRatio).toBeGreaterThan(1)
    expect(summary.cacheSurvivedGap).toBe(false)
    const warmCache = await runPairReal(spyRunner({ usage: { inputTokens: 50, outputTokens: 5, cacheReadTokens: 12_000 } }).runner, buildPairRealPlan(), { sleep: async () => { await Promise.resolve() }, gapMs: 0 })
    expect(summarizePairReal(warmCache).cacheSurvivedGap).toBe(true)
    expect(formatPairRealMarkdown(warmCache, 'real')).toContain('sim (TTL > 5 min)')
  })
})

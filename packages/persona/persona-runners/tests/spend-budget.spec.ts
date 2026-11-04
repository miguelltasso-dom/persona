import { describe, expect, it } from 'vitest'
import {
  createDshRunner,
  evaluateSpend,
  resolveRunner,
  withSpendBudget,
  type DshAgentPort,
  type RunEvent,
  type SpendLedger,
} from '../src/index.ts'

const input = {
  ticketId: 't',
  assignmentId: 'a',
  personaId: 'nina',
  cwd: 'C:/tmp',
  prompt: 'hi',
  model: 'haiku',
  permissionMode: 'deny' as const,
}

function agent(): DshAgentPort {
  return {
    start: async () => ({
      sessionId: 's1',
      events: (async function *() {
        yield { type: 'text' as const, text: 'ok' }
        yield { type: 'ended' as const, text: 'ok' }
      })(),
    }),
    resume: async () => ({
      sessionId: 's1',
      events: (async function *() {
        yield { type: 'ended' as const, text: 'ok' }
      })(),
    }),
    cancel: async () => undefined,
    usage: async () => ({ inputTokens: 10, outputTokens: 5 }),
  }
}

async function collect(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = []
  for await (const event of events) out.push(event)
  return out
}

function ledger(totals: { tokens: number; runs: number }): SpendLedger {
  return {
    totals: () => ({ inputTokens: totals.tokens, outputTokens: 0, runs: totals.runs }),
  }
}

describe('evaluateSpend', () => {
  it('hard-stops at the persona month cap and never suggests another connection', () => {
    const stop = evaluateSpend({
      persona: { tokensPerMonth: 100 },
      project: {},
      personaMonthTokens: 100,
      projectMonthTokens: 0,
      personaDayRuns: 0,
      projectDayRuns: 0,
    })
    expect(stop.allow).toBe(false)
    expect(stop.kind).toBe('tokens_month')
    expect(stop.question).toMatch(/Precisa de você/u)
    expect(stop.question).toMatch(/Aumente o limite, troque o modelo ou pause/u)
    expect(stop.question).not.toMatch(/outra conexão paga automática|fallback/iu)
    expect(stop.question).toMatch(/Não há troca automática/u)
  })

  it('warns at 80% without blocking', () => {
    const warn = evaluateSpend({
      persona: { executionsPerDay: 10 },
      project: {},
      personaMonthTokens: 0,
      projectMonthTokens: 0,
      personaDayRuns: 8,
      projectDayRuns: 0,
    })
    expect(warn.allow).toBe(true)
    expect(warn.warn80).toBe(true)
    expect(warn.warning).toMatch(/80%/u)
  })
})

describe('withSpendBudget', () => {
  it('blocks start when the day execution cap is already spent', async () => {
    const inner = createDshRunner({ agent: agent(), infra: { wait: async () => undefined } })
    const runner = withSpendBudget(inner, {
      personaId: 'nina',
      projectId: 'p1',
      persona: { executionsPerDay: 2 },
      project: {},
      ledger: ledger({ tokens: 0, runs: 2 }),
      now: () => new Date('2026-11-03T12:00:00.000Z'),
    })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
    const ended = events.at(-1)
    expect(ended?.type).toBe('ended')
    if (ended?.type === 'ended') expect(ended.report.question).toMatch(/execuções\/dia/u)
  })

  it('emits a contextual 80% warning then continues', async () => {
    const inner = createDshRunner({ agent: agent(), infra: { wait: async () => undefined } })
    const runner = withSpendBudget(inner, {
      personaId: 'nina',
      projectId: 'p1',
      persona: { tokensPerMonth: 100 },
      project: {},
      ledger: ledger({ tokens: 80, runs: 1 }),
      now: () => new Date('2026-11-03T12:00:00.000Z'),
    })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    expect(events.some(event => event.type === 'report' && event.report.summary.includes('80%'))).toBe(true)
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'ready' } })
  })

  it('resolveRunner wires spend and blocks a project cap', async () => {
    const runner = await resolveRunner({
      spec: { kind: 'dsh', model: 'default' },
      permissionMode: 'deny',
      agent: agent(),
      infra: { wait: async () => undefined },
      spend: {
        personaId: 'nina',
        projectId: 'p1',
        persona: {},
        project: { tokensPerMonth: 50 },
        ledger: ledger({ tokens: 50, runs: 3 }),
        now: () => new Date('2026-11-03T12:00:00.000Z'),
      },
    })
    const handle = await runner.start(input)
    const events = await collect(runner.stream(handle))
    expect(events.at(-1)).toMatchObject({ type: 'ended', report: { state: 'blocked' } })
    expect(JSON.stringify(events)).toMatch(/deste projeto/u)
  })
})

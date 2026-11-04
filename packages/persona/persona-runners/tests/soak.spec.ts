import { describe, expect, it } from 'vitest'
import {
  createDshRunner,
  createProcessBudget,
  createSessionPool,
  measureResourceBudget,
  withSpendBudget,
  type DshAgentPort,
  type RunEvent,
  type TurnRunner,
} from '../src/index.ts'

function agent(): DshAgentPort {
  return {
    start: async () => ({
      sessionId: 'soak',
      events: (async function *() {
        yield { type: 'text' as const, text: 'tick' }
        yield { type: 'ended' as const, text: 'tick' }
      })(),
    }),
    resume: async () => ({
      sessionId: 'soak',
      events: (async function *() {
        yield { type: 'ended' as const, text: 'tick' }
      })(),
    }),
    cancel: async () => undefined,
    usage: async () => ({ inputTokens: 1, outputTokens: 1 }),
  }
}

async function drain(events: AsyncIterable<RunEvent>): Promise<void> {
  for await (const event of events) void event
}

describe('accelerated soak (2h)', () => {
  it('keeps rss and child slots stable across 5 personas, routines, reconnects', async () => {
    const before = measureResourceBudget()
    const children = createProcessBudget(6)
    const pool = createSessionPool<TurnRunner>({ cap: 8 })
    const personas = ['nina', 'bento', 'iris', 'mel', 'noah']
    const ticks = 8
    let reconnects = 0
    for (let tick = 0; tick < ticks; tick += 1) {
      if (tick > 0 && tick % 2 === 0) {
        await pool.disposeAll()
        reconnects += 1
      }
      for (const personaId of personas) {
        expect(children.tryAcquire()).toBe(true)
        const key = `${personaId}|talk`
        let runner = pool.get(key)
        if (runner === undefined) {
          runner = withSpendBudget(
            createDshRunner({ agent: agent(), infra: { wait: async () => undefined } }),
            {
              personaId,
              projectId: 'soak',
              persona: { tokensPerMonth: 1_000_000, executionsPerDay: 200 },
              project: { tokensPerMonth: 5_000_000 },
              ledger: { totals: () => ({ inputTokens: tick, outputTokens: tick, runs: tick }) },
              now: () => new Date(Date.UTC(2026, 10, 3, tick * 3)),
            },
          )
          pool.set(key, runner)
        }
        const handle = await runner.start({
          ticketId: `t-${personaId}`,
          assignmentId: `a-${String(tick)}`,
          personaId,
          cwd: 'C:/tmp',
          prompt: 'routine',
          model: 'haiku',
          permissionMode: 'deny',
        })
        await drain(runner.stream(handle))
        children.release()
      }
    }
    await pool.disposeAll()
    const after = measureResourceBudget()
    expect(reconnects).toBe(3)
    expect(children.live()).toBe(0)
    expect(after.rssMb - before.rssMb).toBeLessThan(80)
    expect(after.heapMb).toBeGreaterThan(0)
  })
})

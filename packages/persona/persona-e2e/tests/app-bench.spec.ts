import { describe, expect, it } from 'vitest'
import { runWebBootBench } from '../src/app-bench.ts'

const runBench = process.env.PERSONA_BENCH === '1'

describe.skipIf(!runBench)('persona app bench (web boot)', () => {
  it('records cold/warm shell-ready ms (append to persona-spec/reports/bench-app.md)', async () => {
    const { sample } = await runWebBootBench()
    expect(sample.coldMs).toBeLessThan(180_000)
    expect(sample.warmMs).toBeLessThan(180_000)
    console.log(`bench shell-ready cold=${sample.coldMs.toFixed(0)}ms warm=${sample.warmMs.toFixed(0)}ms`)
  }, 360_000)

  it.todo('idle CPU < 2% avg over 60s with fake runners (Anvil PRO rest)')
  it.todo('desktop shell-ready + idle memory after 5 min')
})

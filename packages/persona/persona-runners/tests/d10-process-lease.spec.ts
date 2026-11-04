/**
 * D10 — benchmark processo novo × reutilizado (session lease / warm turn), fake CLI only.
 */
import { scriptedRuntime } from '@botiverse/oar/testing'
import { describe, expect, it } from 'vitest'
import { createSessionPool, resolveRunner, type TurnRunner } from '../src/index.ts'
import { runWarmPairSmoke } from '../src/resolve/smoke.ts'

function sayingRuntime() {
  const base = scriptedRuntime({
    id: 'fake-cli',
    turn: (turn) => { turn.say('OK') },
  })
  return Object.assign(base, {
    installation: async () => ({ kind: 'available', via: 'bundled', version: '2.1.317 (fake-persona-e2e)' }),
    authStatus: async () => ({ kind: 'logged_in' }),
    listModels: async () => ({ kind: 'ok', models: [{ id: 'haiku' }] }),
    accountUsage: async () => ({ windows: [] }),
  })
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index] ?? 0
}

describe('D10 process lease (fake CLI)', () => {
  it('pool reuses one CLI install across two resolveRunner calls', async () => {
    let installs = 0
    const runtime = Object.assign(sayingRuntime(), {
      installation: async () => {
        installs += 1
        return { kind: 'available' as const, via: 'bundled' as const }
      },
    })
    const pool = createSessionPool<TurnRunner>()
    const options = {
      spec: { kind: 'cli' as const, cli: 'claude' as const, model: 'haiku' },
      permissionMode: 'deny' as const,
      runtime,
      personId: 'nina',
      projectId: 'p-d10',
      cwd: 'C:/tmp/d10-pool',
      pool,
      infra: { wait: async () => undefined },
    }
    const first = await resolveRunner(options)
    const second = await resolveRunner(options)
    expect(second).toBe(first)
    expect(installs).toBe(1)
    await pool.disposeAll()
  })

  it('warm pair: records cold vs warm p50/p95 (3 pairs, fake CLI)', async () => {
    const rows = await runWarmPairSmoke({
      pairs: 3,
      cli: 'claude',
      cwd: 'C:/tmp/d10-warm',
      runtimes: { claude: sayingRuntime() },
      connections: { timeoutMs: 2_000, force: true },
    })
    expect(rows).toHaveLength(3)
    const coldMs = rows.map(row => row.first.totalMs)
    const warmMs = rows.map(row => row.second.totalMs)
    for (const row of rows) {
      expect(row.first.done).toBe(true)
      expect(row.second.done).toBe(true)
      expect(row.second.kinds).toContain('partial')
    }
    const sample = {
      coldP50Ms: percentile(coldMs, 50),
      warmP50Ms: percentile(warmMs, 50),
      coldP95Ms: percentile(coldMs, 95),
      warmP95Ms: percentile(warmMs, 95),
    }
    console.log(`D10 fake-cli ${JSON.stringify(sample)}`)
    expect(sample.warmP95Ms).toBeLessThanOrEqual(Math.max(sample.coldP95Ms, sample.coldP50Ms) + 5)
  }, 30_000)
})

import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { SCALE, seedScaleWorkspace } from '@deepseek-ai/dsh-persona-store'
import { bindHostFile, HOST_TEST_TIMEOUT_MS, it } from './host-harness.ts'

const { host } = bindHostFile()

function p95(samples: readonly number[]): number {
  const sorted = [...samples].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] ?? 0
}

function timeMs(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

/**
 * Samples per RPC. With 12 the "p95" (`ceil(0.95 * 12) - 1 = 11`) was the MAXIMUM, so one GC pause or one cold call failed the suite (104-215 ms on a loaded machine, 12/11). 30 samples after one
 * untimed warm-up pass make the p95 the second-worst call: a real slowdown (like the actor re-read per card in `listTasks`, ~65 ms) still shows, a single spike does not.
 */
const SAMPLES = 30

it('synthetic 10k/1k/30/10: p95 of main RPCs stays under 100 ms', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'persona-scale-'))
  const db = join(dir, 'persona.db')
  const heapBefore = process.memoryUsage().heapUsed
  const h = host(db)
  const seedMs = timeMs(() => {
    seedScaleWorkspace(h.store)
  })
  const checkpoint = h.checkpointWal()
  const scope = { workspaceId: 'scale-ws', projectId: 'scale-p0' }
  const page = {
    ...scope, streamKind: 'channel' as const, ownerId: 'scale-ch0', actorId: 'ana', afterSeq: 0, limit: 50,
  }
  const listSamples: number[] = []
  const searchSamples: number[] = []
  const taskSamples: number[] = []
  const personaSamples: number[] = []
  // One untimed pass of each RPC: the first call of a process pays statement compilation and the JIT, which the person does not feel on the next click.
  h.listMessages(page)
  h.search({ ...scope, actorId: 'ana', query: 'needle', limit: 20 })
  h.listTasks(scope)
  h.listPersonas(scope)
  for (let i = 0; i < SAMPLES; i += 1) {
    listSamples.push(timeMs(() => {
      const got = h.listMessages({ ...page, afterSeq: i * 50 })
      expect(got.events.length).toBeLessThanOrEqual(50)
    }))
    searchSamples.push(timeMs(() => {
      expect(h.search({ ...scope, actorId: 'ana', query: 'needle', limit: 20 }).length).toBeGreaterThan(0)
    }))
    taskSamples.push(timeMs(() => {
      expect(h.listTasks(scope).length).toBeGreaterThan(50)
    }))
    personaSamples.push(timeMs(() => {
      expect(h.listPersonas(scope).length).toBeGreaterThan(0)
    }))
  }
  const baselineMs = timeMs(() => {
    const got = h.listMessages(page)
    expect(got.events.length).toBe(50)
    expect(got.nextSeq).toBe(50)
  })
  const heapAfter = process.memoryUsage().heapUsed
  const report = {
    seedMs,
    checkpoint,
    listP95: p95(listSamples),
    searchP95: p95(searchSamples),
    tasksP95: p95(taskSamples),
    personasP95: p95(personaSamples),
    baselineMs,
    heapDeltaMb: Math.round((heapAfter - heapBefore) / 1_048_576),
    counts: SCALE,
  }
  console.log(`SCALE ${JSON.stringify(report)}`)
  expect(report.listP95).toBeLessThan(100)
  expect(report.searchP95).toBeLessThan(100)
  expect(report.tasksP95).toBeLessThan(100)
  expect(report.personasP95).toBeLessThan(100)
  expect(report.heapDeltaMb).toBeLessThan(250)
}, HOST_TEST_TIMEOUT_MS)

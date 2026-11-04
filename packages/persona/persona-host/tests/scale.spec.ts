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
  for (let i = 0; i < 12; i += 1) {
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

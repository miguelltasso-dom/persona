import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { SESSION_DISPOSE_CONCURRENCY } from '../src/resolve/session-pool.ts'
import {
  SESSION_LEASE_MS,
  SESSION_POOL_CAP,
  createSessionPool,
  sessionPoolKey,
} from '../src/index.ts'

describe('session pool', () => {
  it('keys talk and task apart', () => {
    const talk = sessionPoolKey({
      personaId: 'nina', projectId: 'p1', purpose: 'talk', provider: 'claude', model: 'haiku',
    })
    const task = sessionPoolKey({
      personaId: 'nina', projectId: 'p1', purpose: 'task', provider: 'claude', model: 'haiku',
    })
    expect(talk).not.toBe(task)
    expect(SESSION_LEASE_MS).toBe(10 * 60_000)
    expect(SESSION_POOL_CAP).toBe(8)
  })

  it('expires idle slots and disposes them', async () => {
    let now = 1_000
    const disposed: string[] = []
    const pool = createSessionPool<string>({
      leaseMs: 100,
      now: () => now,
      dispose: (value) => { disposed.push(value) },
    })
    pool.set('a', 'session-a')
    expect(pool.get('a')).toBe('session-a')
    now = 1_200
    expect(pool.get('a')).toBeUndefined()
    await Promise.resolve()
    expect(disposed).toEqual(['session-a'])
  })

  it('evicts the oldest slot at the cap and disposeAll clears leftovers', async () => {
    const disposed: string[] = []
    let now = 1
    const pool = createSessionPool<string>({
      cap: 2,
      now: () => now,
      dispose: (value) => { disposed.push(value) },
    })
    pool.set('a', 'A')
    now = 2
    pool.set('b', 'B')
    now = 3
    pool.set('c', 'C')
    await Promise.resolve()
    expect(pool.get('a')).toBeUndefined()
    expect(pool.size()).toBe(2)
    await pool.disposeAll()
    expect(pool.size()).toBe(0)
    expect(disposed).toContain('A')
    expect(disposed.length).toBeGreaterThanOrEqual(3)
  })

  it('disposeAll disposes entries in parallel up to the concurrency bound and isolates errors', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const settled: string[] = []
    let releaseFirstWave: (() => void) | undefined
    const waveReady = new Promise<void>((resolve) => {
      releaseFirstWave = resolve
    })

    const pool = createSessionPool<string>({
      cap: 20,
      disposeConcurrency: 4,
      dispose: async (value) => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        if (inFlight === 4) releaseFirstWave?.()
        try {
          await waveReady
          if (value === 'V-2') throw new Error('boom')
          settled.push(value)
        } finally {
          inFlight -= 1
        }
      },
    })

    for (let i = 0; i < 12; i += 1) pool.set(`k-${i}`, `V-${i}`)

    await pool.disposeAll()
    expect(maxInFlight).toBe(4)
    expect(pool.size()).toBe(0)
    expect(settled).toHaveLength(11)
  })

  it('disposeAll caps default concurrency at SESSION_DISPOSE_CONCURRENCY', async () => {
    let inFlight = 0
    let maxInFlight = 0
    let releaseWave: (() => void) | undefined
    const waveReady = new Promise<void>((resolve) => {
      releaseWave = resolve
    })

    const pool = createSessionPool<number>({
      cap: 24,
      dispose: async () => {
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        if (inFlight === SESSION_DISPOSE_CONCURRENCY) releaseWave?.()
        try {
          await waveReady
        } finally {
          inFlight -= 1
        }
      },
    })

    for (let i = 0; i < SESSION_DISPOSE_CONCURRENCY + 4; i += 1) pool.set(`s-${i}`, i)

    await pool.disposeAll()
    expect(maxInFlight).toBe(SESSION_DISPOSE_CONCURRENCY)
    expect(pool.size()).toBe(0)
  })

  it('disposes 13 fake child processes in bounded parallel under 1 s', async () => {
    const children: ChildProcess[] = []
    const script = 'process.stdin.resume(); process.stdin.on("end", () => setTimeout(() => process.exit(0), 150))'
    try {
      for (let i = 0; i < 13; i += 1) {
        children.push(spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'ignore', 'ignore'] }))
      }
      await Promise.all(children.map(child => once(child, 'spawn')))

      const pool = createSessionPool<ChildProcess>({
        cap: 20,
        dispose: async (child) => {
          if (child.exitCode === null && child.signalCode === null) {
            child.stdin?.end()
            await once(child, 'exit')
          }
        },
      })
      children.forEach((child, index) => { pool.set(`cli-${index}`, child) })

      const startedAt = performance.now()
      await pool.disposeAll()
      const elapsedMs = performance.now() - startedAt

      expect(elapsedMs).toBeLessThan(1_000)
      expect(children.every(child => child.exitCode === 0)).toBe(true)
      expect(pool.size()).toBe(0)
    } finally {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      }
    }
  })
})

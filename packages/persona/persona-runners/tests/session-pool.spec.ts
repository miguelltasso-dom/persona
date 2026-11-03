import { describe, expect, it } from 'vitest'
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
})

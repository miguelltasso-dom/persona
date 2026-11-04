import { describe, expect, it } from 'vitest'
import {
  RESOURCE_CHILD_CAP,
  RESOURCE_CONNECTION_CAP,
  RESOURCE_TURN_CAP,
  SESSION_POOL_CAP,
  SOURCE_REQUEST_CAP,
  createProcessBudget,
  measureResourceBudget,
  pollTelegram,
  wouldExceedTurnBudget,
} from '../src/index.ts'

describe('resource budget', () => {
  it('caps concurrent turns and child processes', () => {
    expect(RESOURCE_TURN_CAP).toBe(5)
    expect(RESOURCE_CHILD_CAP).toBe(6)
    expect(RESOURCE_CONNECTION_CAP).toBe(8)
    expect(SOURCE_REQUEST_CAP).toBe(4)
    expect(SESSION_POOL_CAP).toBe(8)
    expect(wouldExceedTurnBudget(4)).toBe(false)
    expect(wouldExceedTurnBudget(5)).toBe(true)
    const children = createProcessBudget(2)
    expect(children.tryAcquire()).toBe(true)
    expect(children.tryAcquire()).toBe(true)
    expect(children.tryAcquire()).toBe(false)
    children.release()
    expect(children.tryAcquire()).toBe(true)
    expect(children.live()).toBe(2)
  })

  it('samples this process without exceeding the policy', () => {
    const snap = measureResourceBudget()
    expect(snap.rssMb).toBeGreaterThan(0)
    expect(snap.heapMb).toBeGreaterThan(0)
    expect(snap.turnCap).toBe(RESOURCE_TURN_CAP)
    expect(snap.childCap).toBe(RESOURCE_CHILD_CAP)
    expect(snap.connectionCap).toBe(RESOURCE_CONNECTION_CAP)
    expect(snap.poolCap).toBe(SESSION_POOL_CAP)
  })

  it('caps a source-poll storm so extra fetches never start', async () => {
    const budget = createProcessBudget(SOURCE_REQUEST_CAP)
    let live = 0
    let peak = 0
    let started = 0
    const hung: Array<() => void> = []
    const fetch = async () => {
      started += 1
      live += 1
      peak = Math.max(peak, live)
      await new Promise<void>((resolve) => {
        hung.push(() => {
          live -= 1
          resolve()
        })
      })
      return {
        ok: true,
        json: async () => ({ result: [] }),
      } as Response
    }
    const storm = Array.from({ length: 20 }, () => pollTelegram({
      token: 'x',
      fetch: fetch as typeof globalThis.fetch,
      baseUrl: 'http://storm.test',
      budget,
    }))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(started).toBe(SOURCE_REQUEST_CAP)
    expect(peak).toBe(SOURCE_REQUEST_CAP)
    for (const release of hung) release()
    const rows = await Promise.all(storm)
    expect(rows.filter(item => item.length === 0)).toHaveLength(20)
    expect(started).toBe(SOURCE_REQUEST_CAP)
  })
})

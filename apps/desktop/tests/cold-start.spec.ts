import { describe, expect, it } from 'vitest'
import {
  COLD_START_AFTER_MS,
  COLD_START_BEFORE_MS,
  coldStartDelta,
  skipUpdaterAtBoot,
  skipWelcomeAtBoot,
} from '../src/cold-start.ts'

describe('desktop cold start', () => {
  it('skips updater and welcome by default and records the 3 cost cuts', () => {
    expect(skipUpdaterAtBoot({})).toBe(true)
    expect(skipWelcomeAtBoot({})).toBe(true)
    expect(skipUpdaterAtBoot({ DSH_DESKTOP_UPDATES: '1' })).toBe(false)
    expect(COLD_START_BEFORE_MS.electronUpdater).toBeGreaterThan(COLD_START_AFTER_MS.electronUpdater)
    expect(COLD_START_BEFORE_MS.updateStack).toBeGreaterThan(COLD_START_AFTER_MS.updateStack)
    expect(COLD_START_BEFORE_MS.welcomeMandatory).toBeGreaterThan(COLD_START_AFTER_MS.welcomeMandatory)
    expect(coldStartDelta({ start: 100, ready: 140 })).toBe(40)
  })
})

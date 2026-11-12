import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { delayHostReadyForTest, TEST_HOST_DELAY_ENV, TEST_HOST_DELAY_MAX_MS, testHostDelayMs } from '../src/test-host-delay.ts'

/**
 * boot-estatico: `PERSONA_TEST_HOST_DELAY_MS` holds the Host child ready back for the acceptance "the shell is visible
 * in under 2.5 s while the Host is still starting". Test-only: anything that is not a plain integer is ignored,
 * and the delay is capped.
 */
describe('testHostDelayMs', () => {
  it('reads a plain non-negative integer', () => {
    expect(testHostDelayMs({ [TEST_HOST_DELAY_ENV]: '10000' })).toBe(10_000)
    expect(testHostDelayMs({ [TEST_HOST_DELAY_ENV]: ' 250 ' })).toBe(250)
    expect(testHostDelayMs({ [TEST_HOST_DELAY_ENV]: '0' })).toBe(0)
  })

  it('ignores a variable nobody set and anything that is not a plain integer', () => {
    expect(testHostDelayMs({})).toBe(0)
    for (const value of ['', ' ', 'abc', '-5', '1.5', '1e4', '10 s', '0x10', 'NaN', 'Infinity', '99999999']) {
      expect(testHostDelayMs({ [TEST_HOST_DELAY_ENV]: value }), `value ${JSON.stringify(value)}`).toBe(0)
    }
  })

  it('caps the delay: a stray huge value cannot stall the app', () => {
    expect(testHostDelayMs({ [TEST_HOST_DELAY_ENV]: '5000000' })).toBe(TEST_HOST_DELAY_MAX_MS)
    expect(testHostDelayMs({ [TEST_HOST_DELAY_ENV]: String(TEST_HOST_DELAY_MAX_MS) })).toBe(TEST_HOST_DELAY_MAX_MS)
  })
})

describe('delayHostReadyForTest', () => {
  it('waits the asked time, once, and says so in one line', async () => {
    const sleep = vi.fn(() => Promise.resolve())
    const lines: string[] = []
    expect(await delayHostReadyForTest({ [TEST_HOST_DELAY_ENV]: '10000' }, sleep, (line) => { lines.push(line) })).toBe(10_000)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(10_000)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain('test only')
  })

  it('does nothing (no wait, no line) when the variable is absent or invalid', async () => {
    const sleep = vi.fn(() => Promise.resolve())
    const lines: string[] = []
    expect(await delayHostReadyForTest({}, sleep, (line) => { lines.push(line) })).toBe(0)
    expect(await delayHostReadyForTest({ [TEST_HOST_DELAY_ENV]: 'depois' }, sleep, (line) => { lines.push(line) })).toBe(0)
    expect(sleep).not.toHaveBeenCalled()
    expect(lines).toEqual([])
  })

  it('really waits on the clock, and only that long', async () => {
    vi.useFakeTimers()
    try {
      let done = false
      const run = delayHostReadyForTest({ [TEST_HOST_DELAY_ENV]: '3000' }, undefined, () => undefined).then(() => { done = true })
      await vi.advanceTimersByTimeAsync(2_999)
      expect(done).toBe(false)
      await vi.advanceTimersByTimeAsync(1)
      await run
      expect(done).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('wiring', () => {
  it('the Host child holds the ready back right before it sends it, and nothing else moves', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    const delay = source.indexOf('delayHostReadyForTest(process.env)')
    const ready = source.indexOf("type: 'ready'")
    expect(delay, 'index.ts calls delayHostReadyForTest(process.env)').toBeGreaterThan(0)
    expect(ready, "index.ts sends the 'ready' message").toBeGreaterThan(0)
    expect(delay, 'the delay comes before the ready message').toBeLessThan(ready)
    expect(source.indexOf('delayHostReadyForTest(process.env)', delay + 1), 'only one call').toBe(-1)
  })
})

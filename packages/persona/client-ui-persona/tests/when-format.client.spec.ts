import { describe, expect, it } from 'vitest'
import { formatUntil, formatWhen } from '../src/client/primitives/when.ts'

// Wednesday 4 Nov 2026, 15:00 local.
const now = new Date(2026, 10, 4, 15, 0, 0)
const at = (d: number, h: number, m = 0, y = 2026, mo = 10) => new Date(y, mo, d, h, m)

describe('formatWhen (UX-BEYOND P1-13)', () => {
  it('says the past the way people do, in pt', () => {
    expect(formatWhen(new Date(now.getTime() - 20_000), { now })).toBe('agora')
    expect(formatWhen(new Date(now.getTime() - 3 * 60_000), { now })).toBe('há 3 min')
    expect(formatWhen(at(4, 9, 5), { now })).toBe('hoje 09:05')
    expect(formatWhen(at(3, 18, 30), { now })).toBe('ontem 18:30')
    expect(formatWhen(at(2, 9, 0), { now })).toBe('segunda 09:00')
    expect(formatWhen(at(20, 10, 0, 2026, 9), { now })).toBe('20 out')
    expect(formatWhen(at(1, 10, 0, 2025, 11), { now })).toBe('1 dez 2025')
    expect(formatWhen('não é data', { now })).toBe('—')
  })

  it('has the same shape in en', () => {
    expect(formatWhen(new Date(now.getTime() - 3 * 60_000), { now, locale: 'en' })).toBe('3 min ago')
    expect(formatWhen(at(3, 18, 30), { now, locale: 'en' })).toMatch(/^yesterday 0?6:30\sPM$/u)
  })
})

describe('formatUntil', () => {
  it('reads deadlines and "back at" moments', () => {
    expect(formatUntil(at(4, 18, 30), { now })).toBe('até 18:30')
    expect(formatUntil(at(5, 9, 0), { now })).toBe('até amanhã 09:00')
    expect(formatUntil(at(9, 9, 0), { now })).toBe('até segunda 09:00')
    expect(formatUntil(at(20, 9, 0), { now })).toBe('até 20 nov')
  })
})

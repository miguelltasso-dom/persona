import { expect, it } from 'vitest'
import { isOnShiftInZone, shouldRunDailyInZone, zonedParts } from '../src/index.ts'

const weekday = { day: 4, start: '09:00', end: '18:00' }

it('America/Sao_Paulo e Europe/Lisbon com DST', () => {
  const sao = zonedParts(new Date('2026-03-26T15:00:00.000Z'), 'America/Sao_Paulo')
  expect(sao.ymd).toBe('2026-03-26')
  const lisbonWinter = zonedParts(new Date('2026-03-29T00:30:00.000Z'), 'Europe/Lisbon')
  const lisbonSummer = zonedParts(new Date('2026-03-29T01:30:00.000Z'), 'Europe/Lisbon')
  expect(lisbonWinter.ymd).toBe('2026-03-29')
  expect(lisbonSummer.minutes).toBeGreaterThan(lisbonWinter.minutes)
  const fallA = zonedParts(new Date('2026-10-25T00:30:00.000Z'), 'Europe/Lisbon')
  const fallB = zonedParts(new Date('2026-10-25T01:30:00.000Z'), 'Europe/Lisbon')
  expect(fallA.ymd).toBe(fallB.ymd)
})

it('iniciativa diária é uma vez por dia local e respeita turno', () => {
  const at = Date.parse('2026-03-26T13:00:00.000Z')
  expect(isOnShiftInZone([weekday], new Date(at), 'America/Sao_Paulo')).toBe(true)
  expect(shouldRunDailyInZone({
    now: at, silenceUntil: 0, shifts: [weekday],
  }, 'America/Sao_Paulo')).toBe(true)
  expect(shouldRunDailyInZone({
    now: at, lastDailyAt: at - 60_000, silenceUntil: 0, shifts: [weekday],
  }, 'America/Sao_Paulo')).toBe(false)
})

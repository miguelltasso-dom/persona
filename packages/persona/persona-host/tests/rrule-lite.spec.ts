import { describe, expect, it } from 'vitest'
import {
  buildRrule,
  describeRrule,
  nextOccurrence,
  occurrencesBetween,
  parseRrule,
  RruleError,
  zonedParts,
  zonedToMs,
} from '../src/rrule-lite.ts'

const iso = (ms: number): string => new Date(ms).toISOString()
const at = (value: string): number => Date.parse(value)

describe('rrule-lite', () => {
  it('daily BYHOUR fires once a day at minute 0 in UTC', () => {
    const got = occurrencesBetween('FREQ=DAILY;BYHOUR=9', 'UTC', at('2026-11-01T00:00:00Z'), at('2026-11-03T00:00:00Z'), at('2026-11-05T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-03T09:00:00.000Z', '2026-11-04T09:00:00.000Z'])
  })

  it('reads the hour in the routine zone (Sao Paulo is UTC-3)', () => {
    const got = occurrencesBetween('FREQ=DAILY;BYHOUR=9', 'America/Sao_Paulo', at('2026-11-01T00:00:00Z'), at('2026-11-03T00:00:00Z'), at('2026-11-04T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-03T12:00:00.000Z'])
  })

  it('lower bound is exclusive and upper bound inclusive', () => {
    const rule = 'FREQ=DAILY;BYHOUR=9'
    const anchor = at('2026-11-01T00:00:00Z')
    expect(occurrencesBetween(rule, 'UTC', anchor, at('2026-11-03T09:00:00Z'), at('2026-11-03T10:00:00Z'))).toEqual([])
    expect(occurrencesBetween(rule, 'UTC', anchor, at('2026-11-03T08:00:00Z'), at('2026-11-03T09:00:00Z')).map(iso)).toEqual(['2026-11-03T09:00:00.000Z'])
  })

  it('without BYHOUR the hour and minute come from the anchor', () => {
    const got = occurrencesBetween('FREQ=DAILY', 'UTC', at('2026-11-01T14:35:00Z'), at('2026-11-02T00:00:00Z'), at('2026-11-04T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-02T14:35:00.000Z', '2026-11-03T14:35:00.000Z'])
  })

  it('several hours and minutes multiply', () => {
    const got = occurrencesBetween('FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0,30', 'UTC', at('2026-11-01T00:00:00Z'), at('2026-11-02T00:00:00Z'), at('2026-11-03T00:00:00Z'))
    expect(got.map(iso)).toEqual([
      '2026-11-02T09:00:00.000Z', '2026-11-02T09:30:00.000Z', '2026-11-02T17:00:00.000Z', '2026-11-02T17:30:00.000Z',
    ])
  })

  it('weekly BYDAY keeps only those weekdays (Mon 2026-11-02, Fri 2026-11-06)', () => {
    const got = occurrencesBetween('FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=8', 'UTC', at('2026-10-26T00:00:00Z'), at('2026-11-01T00:00:00Z'), at('2026-11-10T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-02T08:00:00.000Z', '2026-11-06T08:00:00.000Z', '2026-11-09T08:00:00.000Z'])
  })

  it('daily BYDAY MO..FR skips the weekend', () => {
    const got = occurrencesBetween('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9', 'UTC', at('2026-11-01T00:00:00Z'), at('2026-11-05T12:00:00Z'), at('2026-11-10T00:00:00Z'))
    expect(got.map(iso)).toEqual([
      '2026-11-06T09:00:00.000Z', '2026-11-09T09:00:00.000Z',
    ])
  })

  it('INTERVAL=2 keeps the phase of the anchor', () => {
    const anchor = at('2026-11-01T00:00:00Z')
    const got = occurrencesBetween('FREQ=DAILY;INTERVAL=2;BYHOUR=9', 'UTC', anchor, at('2026-11-01T12:00:00Z'), at('2026-11-08T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-03T09:00:00.000Z', '2026-11-05T09:00:00.000Z', '2026-11-07T09:00:00.000Z'])
  })

  it('weekly INTERVAL=2 skips alternate weeks', () => {
    const got = occurrencesBetween('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=9', 'UTC', at('2026-11-02T00:00:00Z'), at('2026-11-02T12:00:00Z'), at('2026-12-01T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-16T09:00:00.000Z', '2026-11-30T09:00:00.000Z'])
  })

  it('hourly INTERVAL=6 steps from the anchor hour', () => {
    const got = occurrencesBetween('FREQ=HOURLY;INTERVAL=6', 'UTC', at('2026-11-03T00:00:00Z'), at('2026-11-03T00:00:00Z'), at('2026-11-04T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-03T06:00:00.000Z', '2026-11-03T12:00:00.000Z', '2026-11-03T18:00:00.000Z', '2026-11-04T00:00:00.000Z'])
  })

  it('monthly BYMONTHDAY', () => {
    const got = occurrencesBetween('FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=7', 'UTC', at('2026-09-15T00:00:00Z'), at('2026-10-01T08:00:00Z'), at('2026-12-31T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-11-01T07:00:00.000Z', '2026-12-01T07:00:00.000Z'])
  })

  it('follows daylight saving: 09:00 New York is 13:00Z before and 14:00Z after 2026-11-01', () => {
    const got = occurrencesBetween('FREQ=DAILY;BYHOUR=9', 'America/New_York', at('2026-10-01T00:00:00Z'), at('2026-10-31T00:00:00Z'), at('2026-11-03T00:00:00Z'))
    expect(got.map(iso)).toEqual(['2026-10-31T13:00:00.000Z', '2026-11-01T14:00:00.000Z', '2026-11-02T14:00:00.000Z'])
  })

  it('caps the result keeping the newest', () => {
    const got = occurrencesBetween('FREQ=HOURLY', 'UTC', at('2026-11-01T00:00:00Z'), at('2026-11-01T00:00:00Z'), at('2026-11-02T00:00:00Z'), 3)
    expect(got.map(iso)).toEqual(['2026-11-01T22:00:00.000Z', '2026-11-01T23:00:00.000Z', '2026-11-02T00:00:00.000Z'])
  })

  it('nextOccurrence finds the next instant strictly after', () => {
    const anchor = at('2026-11-01T00:00:00Z')
    expect(iso(nextOccurrence('FREQ=DAILY;BYHOUR=9', 'UTC', anchor, at('2026-11-03T09:00:00Z')) ?? 0)).toBe('2026-11-04T09:00:00.000Z')
    expect(iso(nextOccurrence('FREQ=MONTHLY;BYMONTHDAY=31;BYHOUR=9', 'UTC', anchor, at('2026-11-03T09:00:00Z')) ?? 0)).toBe('2026-12-31T09:00:00.000Z')
  })

  it('rejects what it does not support, loudly', () => {
    expect(() => parseRrule('')).toThrow(RruleError)
    expect(() => parseRrule('FREQ=YEARLY')).toThrow(/unsupported|YEARLY/)
    expect(() => parseRrule('FREQ=DAILY;BYSETPOS=1')).toThrow(RruleError)
    expect(() => parseRrule('FREQ=DAILY;BYHOUR=25')).toThrow(RruleError)
    expect(() => parseRrule('FREQ=WEEKLY;BYDAY=XX')).toThrow(RruleError)
    expect(() => parseRrule('BYHOUR=9')).toThrow(RruleError)
    expect(() => occurrencesBetween('FREQ=DAILY', 'Mars/Olympus', 0, 1, 2 * 86_400_000)).toThrow(/fuso/)
    expect(() => occurrencesBetween('FREQ=DAILY', 'UTC', 0, 1, 500 * 86_400_000)).toThrow(RruleError)
    expect(parseRrule('RRULE:FREQ=DAILY;BYHOUR=9').byHour).toEqual([9])
  })

  it('zone helpers round-trip a wall clock time', () => {
    const ms = zonedToMs(2026, 11, 3, 9, 30, 'America/Sao_Paulo')
    expect(iso(ms)).toBe('2026-11-03T12:30:00.000Z')
    expect(zonedParts(ms, 'America/Sao_Paulo')).toMatchObject({ y: 2026, m: 11, d: 3, h: 9, mi: 30, dow: 2 })
  })
})

describe('describeRrule / buildRrule', () => {
  it('describes the common rules in plain Portuguese', () => {
    expect(describeRrule('FREQ=DAILY;BYHOUR=9')).toBe('Todo dia, às 9h')
    expect(describeRrule('FREQ=DAILY;BYHOUR=9;BYMINUTE=30')).toBe('Todo dia, às 9h30')
    expect(describeRrule('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9')).toBe('De segunda a sexta, às 9h')
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO;BYHOUR=8')).toBe('Toda segunda, às 8h')
    expect(describeRrule('FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=8')).toBe('Seg e sex, às 8h')
    expect(describeRrule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;BYHOUR=8')).toBe('A cada 2 semanas, seg, às 8h')
    expect(describeRrule('FREQ=DAILY;INTERVAL=3;BYHOUR=7')).toBe('A cada 3 dias, às 7h')
    expect(describeRrule('FREQ=DAILY;BYHOUR=9,17')).toBe('Todo dia, às 9h e 17h')
    expect(describeRrule('FREQ=HOURLY;INTERVAL=6')).toBe('A cada 6 horas')
    expect(describeRrule('FREQ=HOURLY')).toBe('Toda hora')
    expect(describeRrule('FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=7')).toBe('Todo dia 1 do mês, às 7h')
    expect(describeRrule('isso não é uma regra')).toBe('isso não é uma regra')
  })

  it('builds the rule behind each form preset, and every built rule parses', () => {
    expect(buildRrule({ frequency: 'daily', time: '09:00' })).toBe('FREQ=DAILY;BYHOUR=9;BYMINUTE=0')
    expect(buildRrule({ frequency: 'weekdays', time: '18:30' })).toBe('FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=18;BYMINUTE=30')
    expect(buildRrule({ frequency: 'weekly', time: '08:00', days: [5, 1] })).toBe('FREQ=WEEKLY;BYDAY=MO,FR;BYHOUR=8;BYMINUTE=0')
    expect(buildRrule({ frequency: 'monthly', time: '07:00', monthDay: 1 })).toBe('FREQ=MONTHLY;BYMONTHDAY=1;BYHOUR=7;BYMINUTE=0')
    expect(buildRrule({ frequency: 'hourly', everyHours: 4 })).toBe('FREQ=HOURLY;INTERVAL=4')
    expect(describeRrule(buildRrule({ frequency: 'weekdays', time: '09:00' }))).toBe('De segunda a sexta, às 9h')
    expect(() => buildRrule({ frequency: 'daily', time: '25:00' })).toThrow(RruleError)
    expect(() => buildRrule({ frequency: 'weekly', time: '09:00', days: [] })).toThrow(/dia da semana/)
    expect(() => buildRrule({ frequency: 'monthly', time: '09:00', monthDay: 40 })).toThrow(RruleError)
  })
})

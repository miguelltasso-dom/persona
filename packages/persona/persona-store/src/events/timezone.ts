/**
 * Convert a local civil date/time in an IANA zone to a UTC epoch millisecond.
 */

import { StoreError } from '../errors.ts'

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const OFFSET = /(Z|[+-]\d{2}:\d{2})$/

/**
 * @param local - `YYYY-MM-DD`, local `YYYY-MM-DDTHH:mm[:ss]`, or an offset ISO instant.
 * @param timeZone - IANA zone used for date-only and local datetimes.
 * @param bound - `start` uses 00:00:00, `end` uses 23:59:59 on a date-only value.
 * @returns UTC epoch milliseconds.
 */
export function zonedUtcMs(local: string, timeZone: string, bound: 'start' | 'end'): number {
  if (OFFSET.test(local) && Number.isFinite(Date.parse(local))) return Date.parse(local)
  const dateOnly = DATE_ONLY.exec(local)
  if (dateOnly !== null) {
    const end = bound === 'end'
    return localWallToUtc(
      Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]),
      end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, timeZone,
    )
  }
  const dt = LOCAL_DT.exec(local)
  if (dt !== null) {
    return localWallToUtc(
      Number(dt[1]), Number(dt[2]), Number(dt[3]),
      Number(dt[4]), Number(dt[5]), Number(dt[6] ?? '0'), timeZone,
    )
  }
  throw new StoreError('invalid-input', 'timestamp')
}

function localWallToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, second: number, timeZone: string,
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  try {
    const first = asUtc - offsetAt(timeZone, asUtc)
    return asUtc - offsetAt(timeZone, first)
  } catch {
    throw new StoreError('invalid-input', 'timeZone')
  }
}

function offsetAt(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const wall = Date.UTC(
    num(parts, 'year'), num(parts, 'month') - 1, num(parts, 'day'),
    num(parts, 'hour'), num(parts, 'minute'), num(parts, 'second'),
  )
  return wall - utcMs
}

function num(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const part = parts.find(item => item.type === type)
  if (part === undefined) throw new StoreError('invalid-input', 'timeZone')
  return Number(part.value)
}

/**
 * Initiative routine: daily on-shift + event triggers. Host schedules; engine decides.
 * Respects silence windows (PROACTIVITY.md §4 / PRO-2).
 */

export type InitiativeEvent = 'pr_opened' | 'recurring_error' | 'deadline'

export interface Shift {
  /** 0 = Sunday … 6 = Saturday (Date#getUTCDay). */
  day: number
  start: string
  end: string
}

export interface InitiativeClock {
  now: number
  lastDailyAt?: number
  silenceUntil: number
  shifts: readonly Shift[]
}

/**
 * @param hhmm - `HH:MM`.
 */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

/**
 * @param shifts - Weekly hours (UTC of the supplied Date).
 * @param at - Instant.
 */
export function isOnShift(shifts: readonly Shift[], at: Date): boolean {
  if (shifts.length === 0) return true
  const day = at.getUTCDay()
  const mins = at.getUTCHours() * 60 + at.getUTCMinutes()
  return shifts.some(shift => shift.day === day && mins >= minutesOf(shift.start) && mins < minutesOf(shift.end))
}

/**
 * Daily initiative fires once per UTC day while on shift and outside silence.
 * @param clock - Fake or wall clock.
 */
export function shouldRunDaily(clock: InitiativeClock): boolean {
  if (clock.now < clock.silenceUntil) return false
  const at = new Date(clock.now)
  if (!isOnShift(clock.shifts, at)) return false
  if (clock.lastDailyAt === undefined) return true
  const last = new Date(clock.lastDailyAt)
  return last.getUTCFullYear() !== at.getUTCFullYear()
    || last.getUTCMonth() !== at.getUTCMonth()
    || last.getUTCDate() !== at.getUTCDate()
}

/**
 * Event triggers ignore the daily cap; they still respect silence and shift.
 * @param clock - Clock.
 * @param event - Host-authenticated event.
 */
export function shouldRunOnEvent(clock: InitiativeClock, event: InitiativeEvent): boolean {
  if (clock.now < clock.silenceUntil) return false
  if (!isOnShift(clock.shifts, new Date(clock.now))) return false
  return event === 'pr_opened' || event === 'recurring_error' || event === 'deadline'
}

export interface ZonedParts {
  day: number
  minutes: number
  ymd: string
}

/**
 * Local civil time in `timeZone` (DST-aware via ICU).
 * @param at - Instant.
 * @param timeZone - IANA zone (`America/Sao_Paulo`, `Europe/Lisbon`).
 */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const map: Record<string, string> = {}
  for (const part of fmt.formatToParts(at)) map[part.type] = part.value
  const week: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    day: week[map.weekday ?? 'Sun'] ?? 0,
    minutes: Number(map.hour ?? 0) * 60 + Number(map.minute ?? 0),
    ymd: `${map.year ?? '1970'}-${map.month ?? '01'}-${map.day ?? '01'}`,
  }
}

/**
 * @param shifts - Weekly hours in `timeZone`.
 * @param at - Instant.
 * @param timeZone - IANA zone.
 */
export function isOnShiftInZone(shifts: readonly Shift[], at: Date, timeZone: string): boolean {
  if (shifts.length === 0) return true
  const parts = zonedParts(at, timeZone)
  return shifts.some(shift => shift.day === parts.day && parts.minutes >= minutesOf(shift.start) && parts.minutes < minutesOf(shift.end))
}

/**
 * Daily initiative once per local day in `timeZone`.
 * @param clock - Fake or wall clock.
 * @param timeZone - IANA zone.
 */
export function shouldRunDailyInZone(clock: InitiativeClock, timeZone: string): boolean {
  if (clock.now < clock.silenceUntil) return false
  const at = new Date(clock.now)
  if (!isOnShiftInZone(clock.shifts, at, timeZone)) return false
  if (clock.lastDailyAt === undefined) return true
  return zonedParts(new Date(clock.lastDailyAt), timeZone).ymd !== zonedParts(at, timeZone).ymd
}

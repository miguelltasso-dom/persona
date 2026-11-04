/**
 * "Quando" of a routine, in the words people use (IV-9): Todo dia · Dias úteis · Toda semana · Escolher…
 * The host stores an rrule; the person never sees it. This file builds the rrule in the same few formats the host's
 * `buildRrule` writes, reads back only those, and says them as a sentence. Anything else is "Horário personalizado"
 * (read-only), never guessed at.
 */

export type WhenChoice = 'daily' | 'weekdays' | 'weekly' | 'custom'

export interface RoutineWhen {
  readonly choice: WhenChoice
  /** `HH:MM`, 24 h, local to the routine's zone. */
  readonly time: string
  /** 0 (Sunday) – 6 (Saturday). Meaningful for `custom`; the presets fix their own days. */
  readonly days: readonly number[]
}

/** The time the three presets run at. A different time is "Escolher…". */
export const PRESET_TIME = '09:00'
const ALL_DAYS: readonly number[] = [0, 1, 2, 3, 4, 5, 6]
const WEEKDAYS: readonly number[] = [1, 2, 3, 4, 5]
/** "Toda semana" is Monday: the start of the week, and the example people are shown. */
const WEEKLY_DAY: readonly number[] = [1]
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

export const DEFAULT_WHEN: RoutineWhen = { choice: 'weekly', time: PRESET_TIME, days: WEEKLY_DAY }

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((day, index) => day === b[index])
}

function sortedUnique(days: readonly number[]): readonly number[] {
  return [...new Set(days.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
}

/** The days a choice means (the presets fix theirs; `custom` keeps what was picked). */
export function daysOf(when: RoutineWhen): readonly number[] {
  if (when.choice === 'daily') return ALL_DAYS
  if (when.choice === 'weekdays') return WEEKDAYS
  if (when.choice === 'weekly') return WEEKLY_DAY
  return sortedUnique(when.days)
}

/** Whether the time is a real `HH:MM`. */
export function isValidTime(time: string): boolean {
  const match = /^(\d{2}):(\d{2})$/u.exec(time)
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59
}

/** The choice that exactly describes these days and this time (so editing never changes what a routine means). */
export function normalizeWhen(days: readonly number[], time: string): RoutineWhen {
  const clean = sortedUnique(days)
  if (time === PRESET_TIME) {
    if (sameDays(clean, ALL_DAYS)) return { choice: 'daily', time, days: ALL_DAYS }
    if (sameDays(clean, WEEKDAYS)) return { choice: 'weekdays', time, days: WEEKDAYS }
    if (sameDays(clean, WEEKLY_DAY)) return { choice: 'weekly', time, days: WEEKLY_DAY }
  }
  return { choice: 'custom', time, days: clean }
}

/** Whether a "Escolher…" has what it needs: a real time and at least one day. */
export function whenIsComplete(when: RoutineWhen): boolean {
  return isValidTime(when.time) && daysOf(when).length > 0
}

/**
 * The rule the host stores, in the formats its `buildRrule` writes. All seven days is a daily rule, Monday to Friday is
 * the weekday rule, anything else is a weekly rule on those days.
 * @param when - A complete choice ({@link whenIsComplete}).
 */
export function rruleFromWhen(when: RoutineWhen): string {
  const [hour, minute] = when.time.split(':').map(Number)
  const at = `BYHOUR=${String(hour)};BYMINUTE=${String(minute)}`
  const days = daysOf(when)
  if (sameDays(days, ALL_DAYS)) return `FREQ=DAILY;${at}`
  if (sameDays(days, WEEKDAYS)) return `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;${at}`
  return `FREQ=WEEKLY;BYDAY=${days.map(day => BYDAY[day]).join(',')};${at}`
}

function parseParts(rrule: string): Map<string, string> | undefined {
  const parts = new Map<string, string>()
  for (const piece of rrule.replace(/^RRULE:/iu, '').split(';')) {
    const [key, value] = piece.split('=')
    if (key === undefined || value === undefined || key === '') return undefined
    parts.set(key.toUpperCase(), value)
  }
  return parts
}

/**
 * Reads back only what {@link rruleFromWhen} writes (daily, weekdays, weekly on chosen days, at one time).
 * @returns The choice, or `undefined` for any other rule (hourly, monthly, every 2 weeks…): "Horário personalizado".
 */
export function whenFromRrule(rrule: string): RoutineWhen | undefined {
  const parts = parseParts(rrule)
  if (parts === undefined) return undefined
  const allowed = new Set(['FREQ', 'BYDAY', 'BYHOUR', 'BYMINUTE'])
  if ([...parts.keys()].some(key => !allowed.has(key))) return undefined
  const freq = parts.get('FREQ')
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return undefined
  const hourText = parts.get('BYHOUR')
  if (hourText === undefined || !/^\d{1,2}$/u.test(hourText)) return undefined
  const minuteText = parts.get('BYMINUTE') ?? '0'
  if (!/^\d{1,2}$/u.test(minuteText)) return undefined
  const time = `${hourText.padStart(2, '0')}:${minuteText.padStart(2, '0')}`
  if (!isValidTime(time)) return undefined
  const byDay = parts.get('BYDAY')
  let days: number[]
  if (byDay === undefined) {
    if (freq === 'WEEKLY') return undefined
    days = [...ALL_DAYS]
  } else {
    days = byDay.split(',').map(code => BYDAY.indexOf(code as (typeof BYDAY)[number]))
    if (days.some(day => day < 0)) return undefined
  }
  return normalizeWhen(days, time)
}

type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

/** `H:MM` as people write it ("9:00", "14:30"). */
export function clockLabel(time: string): string {
  const [hour, minute] = time.split(':')
  return `${String(Number(hour))}:${minute ?? '00'}`
}

/**
 * "Toda segunda às 9:00", "Todo dia às 9:00", "De segunda a sexta às 9:00", "Segunda, quarta e sexta às 9:00".
 * The words come from the locale (`when.*`, `day.*`), so the same function speaks pt and en.
 */
export function describeWhen(t: Translate, when: RoutineWhen): string {
  const time = clockLabel(when.time)
  const days = daysOf(when)
  if (sameDays(days, ALL_DAYS)) return t('when.daily', { time })
  if (sameDays(days, WEEKDAYS)) return t('when.weekdays', { time })
  if (days.length === 1) {
    const day = days[0] ?? 1
    return t(day === 0 || day === 6 ? 'when.weeklyM' : 'when.weeklyF', { day: t(`day.${String(day)}`), time })
  }
  const names = days.map(day => t(`day.${String(day)}`))
  const last = names.pop() ?? ''
  const list = names.length === 0 ? last : `${names.join(', ')} ${t('when.and')} ${last}`
  return t('when.many', { days: list.charAt(0).toUpperCase() + list.slice(1), time })
}

/** The week of `now`, Monday to Sunday, without a fixed date: "3 a 9 de nov" / "Nov 3–9" (and across months). */
export function weekRangeLabel(now: Date, locale: 'pt' | 'en' = 'pt'): string {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)
  const tag = locale === 'pt' ? 'pt-BR' : 'en-US'
  const month = (date: Date): string => new Intl.DateTimeFormat(tag, { month: 'short' }).format(date).replace(/\./gu, '')
  const same = monday.getMonth() === sunday.getMonth()
  if (locale === 'pt') {
    return same
      ? `${String(monday.getDate())} a ${String(sunday.getDate())} de ${month(monday)}`
      : `${String(monday.getDate())} de ${month(monday)} a ${String(sunday.getDate())} de ${month(sunday)}`
  }
  const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)
  return same
    ? `${capital(month(monday))} ${String(monday.getDate())}–${String(sunday.getDate())}`
    : `${capital(month(monday))} ${String(monday.getDate())} – ${capital(month(sunday))} ${String(sunday.getDate())}`
}

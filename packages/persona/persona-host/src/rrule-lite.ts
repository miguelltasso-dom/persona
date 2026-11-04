/**
 * Small RRULE subset for Rotinas: when does a routine occur, in its own time zone?
 *
 * Hoje ninguém materializava `routine_run` a partir do `rrule`; o agendador do host usa isto.
 * Suportado: FREQ=HOURLY|DAILY|WEEKLY|MONTHLY, INTERVAL, BYHOUR, BYMINUTE, BYDAY, BYMONTHDAY.
 * Defaults (documentados, deterministas): com BYHOUR e sem BYMINUTE o minuto é 0; sem BYHOUR a hora/minuto
 * vêm da âncora (criação da rotina), como em DTSTART.
 */

/** Rejected or unsupported rule. The scheduler turns it into a visible audit line. */
export class RruleError extends Error {
  readonly code: 'syntax' | 'unsupported' | 'timezone'

  /**
   * @param code - Machine-readable reason.
   * @param message - Human detail (no user data).
   */
  constructor(code: 'syntax' | 'unsupported' | 'timezone', message: string) {
    super(message)
    this.name = 'RruleError'
    this.code = code
  }
}

/** Supported frequencies. */
export type RruleFreq = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY'

/** Parsed rule. Days are 0 (Sunday) – 6 (Saturday), like `weeklyHours.day`. */
export interface ParsedRrule {
  readonly freq: RruleFreq
  readonly interval: number
  readonly byHour: readonly number[]
  readonly byMinute: readonly number[]
  readonly byDay: readonly number[]
  readonly byMonthDay: readonly number[]
}

const DAYS: Readonly<Record<string, number>> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const MAX_SPAN_DAYS = 400
const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

/**
 * Parse `FREQ=DAILY;BYHOUR=9` (optional `RRULE:` prefix).
 * @param rule - Rule text.
 * @throws RruleError on unknown or malformed parts.
 */
export function parseRrule(rule: string): ParsedRrule {
  const body = rule.trim().replace(/^RRULE:/iu, '')
  if (body === '') throw new RruleError('syntax', 'rrule vazio')
  const parts = new Map<string, string>()
  for (const piece of body.split(';')) {
    const [key, value, ...rest] = piece.split('=')
    if (key === undefined || value === undefined || rest.length > 0 || key.trim() === '' || value.trim() === '') {
      throw new RruleError('syntax', `parte inválida: ${piece}`)
    }
    parts.set(key.trim().toUpperCase(), value.trim().toUpperCase())
  }
  const freq = parts.get('FREQ')
  if (freq !== 'HOURLY' && freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') {
    throw new RruleError('unsupported', `FREQ=${freq ?? ''}`)
  }
  for (const key of parts.keys()) {
    if (!['FREQ', 'INTERVAL', 'BYHOUR', 'BYMINUTE', 'BYDAY', 'BYMONTHDAY'].includes(key)) {
      throw new RruleError('unsupported', key)
    }
  }
  const interval = parts.has('INTERVAL') ? number(parts.get('INTERVAL'), 1, 1000, 'INTERVAL') : 1
  const byDay = (parts.get('BYDAY') ?? '').split(',').filter(item => item !== '').map((item) => {
    const day = DAYS[item]
    if (day === undefined) throw new RruleError('syntax', `BYDAY=${item}`)
    return day
  })
  return {
    freq,
    interval,
    byHour: list(parts.get('BYHOUR'), 0, 23, 'BYHOUR'),
    byMinute: list(parts.get('BYMINUTE'), 0, 59, 'BYMINUTE'),
    byDay: [...new Set(byDay)].sort((a, b) => a - b),
    byMonthDay: list(parts.get('BYMONTHDAY'), 1, 31, 'BYMONTHDAY'),
  }
}

/**
 * Instants (epoch ms, ascending) where the rule occurs in `(fromMs, toMs]`.
 * @param rule - Rule text.
 * @param timeZone - IANA zone the rule is read in.
 * @param anchorMs - Rule start (routine creation): fixes INTERVAL phase and default hour/minute.
 * @param fromMs - Exclusive lower bound.
 * @param toMs - Inclusive upper bound.
 * @param cap - Maximum instants returned (newest kept when more exist).
 * @throws RruleError on a bad rule, zone, or span beyond ~13 months.
 */
export function occurrencesBetween(
  rule: string,
  timeZone: string,
  anchorMs: number,
  fromMs: number,
  toMs: number,
  cap: number = 100,
): number[] {
  const parsed = parseRrule(rule)
  checkZone(timeZone)
  if (!(toMs > fromMs)) return []
  if ((toMs - fromMs) / DAY_MS > MAX_SPAN_DAYS) throw new RruleError('unsupported', 'intervalo longo demais')
  const found = parsed.freq === 'HOURLY'
    ? hourly(parsed, timeZone, anchorMs, fromMs, toMs)
    : calendar(parsed, timeZone, anchorMs, fromMs, toMs)
  const unique = [...new Set(found)].sort((a, b) => a - b).filter(at => at > fromMs && at <= toMs)
  return unique.length <= cap ? unique : unique.slice(unique.length - cap)
}

/**
 * First occurrence strictly after `afterMs`, looking up to a year ahead; undefined when none.
 * @param rule - Rule text.
 * @param timeZone - IANA zone.
 * @param anchorMs - Rule start.
 * @param afterMs - Exclusive lower bound.
 */
export function nextOccurrence(rule: string, timeZone: string, anchorMs: number, afterMs: number): number | undefined {
  for (const window of [2, 14, 62, 380]) {
    const found = occurrencesBetween(rule, timeZone, anchorMs, afterMs, afterMs + window * DAY_MS, 1_000)
    if (found[0] !== undefined) return found[0]
  }
  return undefined
}

/**
 * Wall-clock fields of an instant in a zone.
 * @param ms - Epoch ms.
 * @param timeZone - IANA zone.
 */
export function zonedParts(ms: number, timeZone: string): { y: number; m: number; d: number; h: number; mi: number; dow: number } {
  const parts = formatter(timeZone).formatToParts(new Date(ms))
  const get = (type: string): number => Number(parts.find(part => part.type === type)?.value ?? '0')
  const y = get('year')
  const m = get('month')
  const d = get('day')
  return { y, m, d, h: get('hour') % 24, mi: get('minute'), dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

/**
 * Epoch ms of a wall-clock time in a zone (DST gap resolves forward, overlap to the first).
 * @param y - Year.
 * @param m - Month 1-12.
 * @param d - Day of month.
 * @param h - Hour.
 * @param mi - Minute.
 * @param timeZone - IANA zone.
 */
export function zonedToMs(y: number, m: number, d: number, h: number, mi: number, timeZone: string): number {
  const naive = Date.UTC(y, m - 1, d, h, mi)
  let guess = naive - offsetAt(naive, timeZone)
  const corrected = naive - offsetAt(guess, timeZone)
  if (corrected !== guess) guess = corrected
  return guess
}

function calendar(rule: ParsedRrule, timeZone: string, anchorMs: number, fromMs: number, toMs: number): number[] {
  const anchor = zonedParts(anchorMs, timeZone)
  const anchorDay = Date.UTC(anchor.y, anchor.m - 1, anchor.d) / DAY_MS
  const hours = rule.byHour.length > 0 ? rule.byHour : [anchor.h]
  const minutes = rule.byMinute.length > 0 ? rule.byMinute : (rule.byHour.length > 0 ? [0] : [anchor.mi])
  const out: number[] = []
  const first = zonedParts(fromMs - DAY_MS, timeZone)
  const last = zonedParts(toMs + DAY_MS, timeZone)
  const endDay = Date.UTC(last.y, last.m - 1, last.d) / DAY_MS
  for (let day = Date.UTC(first.y, first.m - 1, first.d) / DAY_MS; day <= endDay; day += 1) {
    const date = new Date(day * DAY_MS)
    const y = date.getUTCFullYear()
    const m = date.getUTCMonth() + 1
    const d = date.getUTCDate()
    if (!matchesDay(rule, day, anchorDay, anchor, date)) continue
    for (const h of hours) {
      for (const mi of minutes) {
        const at = zonedToMs(y, m, d, h, mi, timeZone)
        if (at > fromMs && at <= toMs) out.push(at)
      }
    }
  }
  return out
}

function matchesDay(
  rule: ParsedRrule,
  day: number,
  anchorDay: number,
  anchor: { y: number; m: number; d: number; dow: number },
  date: Date,
): boolean {
  const dow = date.getUTCDay()
  if (rule.freq === 'DAILY') {
    if (mod(day - anchorDay, rule.interval) !== 0) return false
    return rule.byDay.length === 0 || rule.byDay.includes(dow)
  }
  if (rule.freq === 'WEEKLY') {
    // Weeks start on Monday; epoch day 0 was a Thursday.
    const weekOf = (value: number): number => Math.floor((value + 3) / 7)
    if (mod(weekOf(day) - weekOf(anchorDay), rule.interval) !== 0) return false
    return (rule.byDay.length === 0 ? [anchor.dow] : rule.byDay).includes(dow)
  }
  const months = (date.getUTCFullYear() - anchor.y) * 12 + (date.getUTCMonth() + 1 - anchor.m)
  if (mod(months, rule.interval) !== 0) return false
  const monthDays = rule.byMonthDay.length === 0 ? [anchor.d] : rule.byMonthDay
  return monthDays.includes(date.getUTCDate())
}

function mod(value: number, by: number): number {
  return ((value % by) + by) % by
}

function hourly(rule: ParsedRrule, timeZone: string, anchorMs: number, fromMs: number, toMs: number): number[] {
  const minutes = rule.byMinute.length > 0 ? rule.byMinute : [0]
  const base = Math.floor(anchorMs / HOUR_MS) * HOUR_MS
  const step = rule.interval * HOUR_MS
  const startIndex = Math.floor((fromMs - HOUR_MS - base) / step)
  const out: number[] = []
  for (let at = base + startIndex * step; at <= toMs; at += step) {
    const local = zonedParts(at, timeZone)
    if (rule.byHour.length > 0 && !rule.byHour.includes(local.h)) continue
    if (rule.byDay.length > 0 && !rule.byDay.includes(local.dow)) continue
    for (const mi of minutes) {
      const instant = at + mi * 60_000
      if (instant > fromMs && instant <= toMs) out.push(instant)
    }
  }
  return out
}

function list(value: string | undefined, min: number, max: number, name: string): number[] {
  if (value === undefined) return []
  return [...new Set(value.split(',').map(item => number(item, min, max, name)))].sort((a, b) => a - b)
}

function number(value: string | undefined, min: number, max: number, name: string): number {
  const parsed = Number(value)
  if (value === undefined || value.trim() === '' || !Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new RruleError('syntax', `${name}=${value ?? ''}`)
  }
  return parsed
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  const cached = FORMATTERS.get(timeZone)
  if (cached !== undefined) return cached
  checkZone(timeZone)
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  FORMATTERS.set(timeZone, created)
  return created
}

function checkZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
  } catch {
    throw new RruleError('timezone', `fuso inválido: ${timeZone}`)
  }
}

function offsetAt(ms: number, timeZone: string): number {
  const local = zonedParts(ms, timeZone)
  return Date.UTC(local.y, local.m - 1, local.d, local.h, local.mi) - Math.floor(ms / 60_000) * 60_000
}

const DAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'] as const
const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

/**
 * Plain-Portuguese description of a rule for the Rotinas card ("De segunda a sexta, às 9h").
 * @param rule - Rule text.
 * @returns The sentence, or the raw text when the rule cannot be read.
 */
export function describeRrule(rule: string): string {
  let parsed: ParsedRrule
  try {
    parsed = parseRrule(rule)
  } catch {
    return rule
  }
  const times = (): string => {
    const hours = parsed.byHour
    if (hours.length === 0) return ''
    const minutes = parsed.byMinute.length > 0 ? parsed.byMinute : [0]
    const labels = hours.flatMap(h => minutes.map(m => (m === 0 ? `${String(h)}h` : `${String(h)}h${String(m).padStart(2, '0')}`)))
    return `, às ${labels.length === 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} e ${labels.at(-1) ?? ''}`}`
  }
  const days = parsed.byDay
  const weekdays = days.length === 5 && [1, 2, 3, 4, 5].every(day => days.includes(day))
  const named = (list: readonly number[], names: readonly string[]): string => {
    const labels = list.map(day => names[day] ?? '')
    return labels.length === 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} e ${labels.at(-1) ?? ''}`
  }
  if (parsed.freq === 'HOURLY') return parsed.interval === 1 ? 'Toda hora' : `A cada ${String(parsed.interval)} horas`
  if (parsed.freq === 'DAILY') {
    if (parsed.interval > 1) return `A cada ${String(parsed.interval)} dias${times()}`
    if (weekdays) return `De segunda a sexta${times()}`
    if (days.length > 0) return `${capitalize(named(days, DAY_SHORT))}${times()}`
    return `Todo dia${times()}`
  }
  if (parsed.freq === 'WEEKLY') {
    if (parsed.interval > 1) {
      const which = days.length === 0 ? '' : `, ${named(days, DAY_SHORT)}`
      return `A cada ${String(parsed.interval)} semanas${which}${times()}`
    }
    if (days.length === 1) return `Toda ${DAY_NAMES[days[0] ?? 0] ?? ''}${times()}`
    if (days.length > 1) return `${capitalize(named(days, DAY_SHORT))}${times()}`
    return `Toda semana${times()}`
  }
  const monthDays = parsed.byMonthDay.length > 0 ? parsed.byMonthDay : []
  const dayLabel = monthDays.length === 0 ? 'No dia da criação' : `Todo dia ${monthDays.join(', ')}`
  return `${dayLabel}${parsed.interval > 1 ? `, a cada ${String(parsed.interval)} meses` : ' do mês'}${times()}`
}

function capitalize(value: string): string {
  return value === '' ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

/** Friendly schedule the Rotinas form offers; {@link buildRrule} turns it into a rule. */
export interface SchedulePreset {
  readonly frequency: 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'hourly'
  /** `HH:MM`, local to the routine zone. Ignored for hourly. */
  readonly time?: string
  /** 0 (Sunday) – 6; used by weekly. */
  readonly days?: readonly number[]
  /** Day of month for monthly. */
  readonly monthDay?: number
  /** Hours between runs for hourly. */
  readonly everyHours?: number
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/**
 * Rule text for a friendly preset. Throws {@link RruleError} on a malformed preset.
 * @param preset - Form values.
 */
export function buildRrule(preset: SchedulePreset): string {
  const match = /^(\d{2}):(\d{2})$/u.exec(preset.time ?? '09:00')
  const hour = Number(match?.[1])
  const minute = Number(match?.[2])
  if (preset.frequency !== 'hourly' && (match === null || hour > 23 || minute > 59)) throw new RruleError('syntax', 'horário inválido')
  const at = `BYHOUR=${String(hour)};BYMINUTE=${String(minute)}`
  let rule: string
  if (preset.frequency === 'hourly') {
    const every = preset.everyHours ?? 1
    if (!Number.isInteger(every) || every < 1 || every > 24) throw new RruleError('syntax', 'intervalo inválido')
    rule = every === 1 ? 'FREQ=HOURLY' : `FREQ=HOURLY;INTERVAL=${String(every)}`
  } else if (preset.frequency === 'daily') rule = `FREQ=DAILY;${at}`
  else if (preset.frequency === 'weekdays') rule = `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;${at}`
  else if (preset.frequency === 'weekly') {
    const days = [...new Set(preset.days ?? [])].sort((a, b) => a - b)
    if (days.length === 0 || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new RruleError('syntax', 'escolha ao menos um dia da semana')
    rule = `FREQ=WEEKLY;BYDAY=${days.map(day => BYDAY[day]).join(',')};${at}`
  } else {
    const day = preset.monthDay ?? 1
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new RruleError('syntax', 'dia do mês inválido')
    rule = `FREQ=MONTHLY;BYMONTHDAY=${String(day)};${at}`
  }
  parseRrule(rule)
  return rule
}

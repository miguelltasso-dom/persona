/**
 * Muse (UX-BEYOND P1-13): one way to say "when" across the app, so the thread, the board, the history and the limits
 * all read the same. Past → `formatWhen` ("agora", "há 3 min", "hoje 14:20", "ontem 09:10", "segunda 09:00",
 * "4 nov", "4 nov 2025"); deadline → `formatUntil` ("até 18:30", "até amanhã 09:00", "até segunda 09:00").
 * Pure functions: pass `now` in tests.
 */

export type WhenLocale = 'pt' | 'en'

const DAY = 86_400_000

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function time(date: Date, locale: WhenLocale): string {
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: locale === 'en' }).format(date)
}

function weekday(date: Date, locale: WhenLocale): string {
  return new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', { weekday: 'long' }).format(date).replace('-feira', '')
}

function dayMonth(date: Date, locale: WhenLocale, withYear: boolean): string {
  const text = new Intl.DateTimeFormat(locale === 'pt' ? 'pt-BR' : 'en-US', {
    day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
  }).format(date)
  return locale === 'pt' ? text.replace(/\./gu, '').replace(/ de /gu, ' ') : text
}

/** A past moment, as people say it. */
export function formatWhen(at: Date | string | number, options: { readonly now?: Date; readonly locale?: WhenLocale } = {}): string {
  const date = new Date(at)
  const now = options.now ?? new Date()
  const locale = options.locale ?? 'pt'
  const diff = now.getTime() - date.getTime()
  if (Number.isNaN(date.getTime())) return '—'
  if (diff < 45_000) return locale === 'pt' ? 'agora' : 'just now'
  if (diff < 3_600_000) {
    const minutes = Math.max(1, Math.round(diff / 60_000))
    return locale === 'pt' ? `há ${minutes} min` : `${minutes} min ago`
  }
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY)
  if (days <= 0) return `${locale === 'pt' ? 'hoje' : 'today'} ${time(date, locale)}`
  if (days === 1) return `${locale === 'pt' ? 'ontem' : 'yesterday'} ${time(date, locale)}`
  if (days < 7) return `${weekday(date, locale)} ${time(date, locale)}`
  return dayMonth(date, locale, date.getFullYear() !== now.getFullYear())
}

/** A deadline or a "back at" moment ("No limite até 18:30", "Fora até amanhã 09:00"). */
export function formatUntil(at: Date | string | number, options: { readonly now?: Date; readonly locale?: WhenLocale } = {}): string {
  const date = new Date(at)
  const now = options.now ?? new Date()
  const locale = options.locale ?? 'pt'
  if (Number.isNaN(date.getTime())) return '—'
  const until = locale === 'pt' ? 'até' : 'until'
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY)
  if (days <= 0) return `${until} ${time(date, locale)}`
  if (days === 1) return `${until} ${locale === 'pt' ? 'amanhã' : 'tomorrow'} ${time(date, locale)}`
  if (days < 7) return `${until} ${weekday(date, locale)} ${time(date, locale)}`
  return `${until} ${dayMonth(date, locale, date.getFullYear() !== now.getFullYear())}`
}

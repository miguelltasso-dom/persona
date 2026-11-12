/**
 * Item 26 (26.15): what starts a routine when it is not the clock. The wire shape is the host's `RoutineTrigger` (`{ kind: 'event', source, filter }`);
 * the screen edits the filter as plain text (commas) and turns it into short lists on save. Pure: no React, no host import.
 */

export const EVENT_SOURCES = ['email', 'telegram', 'slack', 'discord', 'calendar'] as const
export type EventSourceId = (typeof EVENT_SOURCES)[number]

/** The filter as the host stores it: every non-empty list narrows; empty = anything. */
export interface EventFilterWire {
  readonly from?: readonly string[]
  readonly to?: readonly string[]
  readonly channel?: readonly string[]
  readonly contains?: readonly string[]
}

export interface RoutineEventWire {
  readonly kind: 'event'
  readonly source: EventSourceId
  readonly filter: EventFilterWire
}

/** The filter as the person types it (one text per field). */
export interface EventFilterText {
  readonly from: string
  readonly to: string
  readonly channel: string
  readonly contains: string
}

export const EMPTY_FILTER_TEXT: EventFilterText = { from: '', to: '', channel: '', contains: '' }

/** Which fields a source has: an e-mail has an address it was sent to; a chat has a channel; the agenda only words. */
export function fieldsOf(source: EventSourceId): readonly (keyof EventFilterText)[] {
  if (source === 'email') return ['to', 'from', 'contains']
  if (source === 'calendar') return ['contains']
  return ['channel', 'from', 'contains']
}

/** The most words one field keeps (the host caps the same). */
const LIST_MAX = 10

/** "ana@x.com, pedido" → ['ana@x.com', 'pedido']. Commas and line breaks separate; blanks go. */
export function wordsOf(text: string): string[] {
  return text.split(/[,\n;]/u).map(item => item.replace(/\s+/gu, ' ').trim()).filter(item => item !== '').slice(0, LIST_MAX)
}

export const joinWords = (list: readonly string[] | undefined): string => (list ?? []).join(', ')

export function textOfFilter(filter: EventFilterWire | undefined): EventFilterText {
  return { from: joinWords(filter?.from), to: joinWords(filter?.to), channel: joinWords(filter?.channel), contains: joinWords(filter?.contains) }
}

/** The filter to send: only the fields this source has, only the ones with words. */
export function wireOfFilter(source: EventSourceId, text: EventFilterText): EventFilterWire {
  const out: { -readonly [K in keyof EventFilterWire]: string[] } = {}
  for (const field of fieldsOf(source)) {
    const words = wordsOf(text[field])
    if (words.length > 0) out[field] = words
  }
  return out
}

type T = (key: string, params?: Readonly<Record<string, string | number>>) => string

const anyKey = (source: EventSourceId): string => (source === 'email' ? 'editor.event.any.email' : source === 'calendar' ? 'editor.event.any.calendar' : 'editor.event.any.chat')

/**
 * The first line of the strip ("vendas@padarialua.com.br · de ana@x.com · com “pedido”"): the address plain, the rest introduced; "Qualquer e-mail" when nothing narrows.
 * @param t - Locale.
 * @param source - The connector.
 * @param filter - What the person typed (or the host stored).
 */
export function stripOf(t: T, source: EventSourceId, filter: EventFilterText): string {
  const to = joinWords(wordsOf(filter.to))
  const from = joinWords(wordsOf(filter.from))
  const channel = joinWords(wordsOf(filter.channel))
  const contains = joinWords(wordsOf(filter.contains))
  const parts = [
    ...(source === 'email' && to !== '' ? [to] : []),
    ...(from === '' ? [] : [t('editor.event.part.from', { value: from })]),
    ...(source !== 'email' && source !== 'calendar' && channel !== '' ? [t('editor.event.part.channel', { value: channel })] : []),
    ...(contains === '' ? [] : [t('editor.event.part.contains', { value: contains })]),
  ]
  return parts.length === 0 ? t(anyKey(source)) : parts.join(' · ')
}

/**
 * The same filter said inside the routine's summary sentence ("… chegar e-mail em vendas@x de ana@y com “pedido”"): leading space, empty when nothing narrows.
 * @param t - Locale.
 * @param source - The connector.
 * @param filter - What the person typed.
 */
export function filterSentence(t: T, source: EventSourceId, filter: EventFilterText): string {
  const to = joinWords(wordsOf(filter.to))
  const from = joinWords(wordsOf(filter.from))
  const channel = joinWords(wordsOf(filter.channel))
  const contains = joinWords(wordsOf(filter.contains))
  const parts = [
    ...(source === 'email' && to !== '' ? [t('editor.event.part.to', { value: to })] : []),
    ...(from === '' ? [] : [t('editor.event.part.from', { value: from })]),
    ...(source !== 'email' && source !== 'calendar' && channel !== '' ? [t('editor.event.part.channel', { value: channel })] : []),
    ...(contains === '' ? [] : [t('editor.event.part.contains', { value: contains })]),
  ]
  return parts.length === 0 ? '' : ` ${parts.join(' ')}`
}

/** The labels of an event as the Select shows them (keys `editor.event.<source>`). */
export const eventLabelKey = (source: EventSourceId): string => `editor.event.${source}`
/** The phrase inside the summary ("quando chegar e-mail"). */
export const eventWhenKey = (source: EventSourceId): string => `editor.event.when.${source}`

/** What the screen reads of a stored trigger: only an event of a known source (the host sends no `trigger` for a clock routine). */
export function readEventWire(value: unknown): RoutineEventWire | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const row = value as { kind?: unknown; source?: unknown; filter?: unknown }
  if (row.kind !== 'event' || typeof row.source !== 'string' || !(EVENT_SOURCES as readonly string[]).includes(row.source)) return undefined
  const filter = row.filter !== null && typeof row.filter === 'object' ? row.filter as Record<string, unknown> : {}
  const list = (raw: unknown): string[] | undefined => (Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : undefined)
  const from = list(filter.from)
  const to = list(filter.to)
  const channel = list(filter.channel)
  const contains = list(filter.contains)
  return {
    kind: 'event',
    source: row.source as EventSourceId,
    filter: {
      ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }),
      ...(channel === undefined ? {} : { channel }), ...(contains === undefined ? {} : { contains }),
    },
  }
}

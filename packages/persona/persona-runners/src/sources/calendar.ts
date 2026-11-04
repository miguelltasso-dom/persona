/**
 * ICS / CalDAV → temporal Triggers for routines. Credentials stay in the vault.
 */

import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import { withSourceRequest, type ProcessBudget } from '../resolve/resource-budget.ts'

export const CALENDAR_SOURCE = 'calendar'

export interface CalendarEvent {
  uid: string
  summary: string
  dtstart: string
  description?: string
}

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/gu, '').replace(/\n[ \t]/gu, '')
}

function field(block: string, name: string): string {
  const line = block.split(/\r?\n/u).find(row => row.startsWith(`${name}:`) || row.startsWith(`${name};`))
  if (line === undefined) return ''
  const colon = line.indexOf(':')
  return colon < 0 ? '' : line.slice(colon + 1).trim()
}

/**
 * Parse VEVENT blocks from an ICS document. No network.
 * @param ics - Calendar text.
 */
export function parseIcsEvents(ics: string): CalendarEvent[] {
  const text = unfold(ics)
  const blocks = text.split('BEGIN:VEVENT').slice(1)
  const out: CalendarEvent[] = []
  for (const raw of blocks) {
    const block = raw.split('END:VEVENT')[0] ?? ''
    const uid = field(block, 'UID')
    const summary = field(block, 'SUMMARY')
    const dtstart = field(block, 'DTSTART')
    if (uid === '' || summary === '' || dtstart === '') continue
    const description = field(block, 'DESCRIPTION')
    out.push({
      uid,
      summary,
      dtstart,
      ...(description === '' ? {} : { description }),
    })
  }
  return out
}

/**
 * Map a calendar event onto a temporal Trigger (routines consume `meta.dtstart`).
 * @param event - Parsed VEVENT.
 */
export function calendarEventToTrigger(event: CalendarEvent): Trigger {
  return {
    id: `cal:${event.uid}`,
    source: CALENDAR_SOURCE,
    threads: [{ source: CALENDAR_SOURCE, id: event.summary }],
    actor: { source: CALENDAR_SOURCE, id: 'calendar' },
    human: false,
    at: new Date().toISOString(),
    text: event.description ?? event.summary,
    channel: {
      source: CALENDAR_SOURCE,
      thread: event.summary,
      address: { uid: event.uid, dtstart: event.dtstart },
    },
    meta: { dtstart: event.dtstart, uid: event.uid },
  }
}

/**
 * Pull an ICS document from a fake CalDAV/HTTP endpoint.
 * @param options - Fetch, URL, optional basic token (never logged).
 */
export async function pollCalDav(options: {
  url: string
  fetch: typeof fetch
  token?: string
  budget?: ProcessBudget
}): Promise<Trigger[]> {
  return withSourceRequest(options.budget, [], async () => {
    const headers: Record<string, string> = {}
    if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`
    const response = await options.fetch(options.url, { headers })
    if (!response.ok) return []
    return parseIcsEvents(await response.text()).map(calendarEventToTrigger)
  })
}

/** Honest Windows toasts: attention budget, silence windows, grouping, internal deep links. */

import { personaTaskHref } from './deep-link.ts'

/** Policy from Anvil Remote `getAttentionPolicy` (Status contract). */
export interface DesktopAttentionPolicy {
  readonly delivery: 'summary' | 'ping'
  readonly proposalBudget: number
  readonly quietStart: string
  readonly quietEnd: string
}

export interface DesktopAttentionEvent {
  readonly id: string
  readonly kind: 'needs-you' | 'review'
  readonly title: string
  readonly ticketId: string
  readonly at: string
}

export interface DesktopNotificationPayload {
  readonly title: string
  readonly body: string
  readonly href: string
  readonly tag: string
}

export interface DesktopNotificationClock {
  now(): Date
}

export interface DesktopNotificationSink {
  show(payload: DesktopNotificationPayload): { onClick?: (href: string) => void }
}

export interface DesktopNotificationsOptions {
  readonly policy: () => DesktopAttentionPolicy
  readonly locale: () => {
    needsYouTitle: string
    reviewReadyTitle: string
    notifyGroupedBody: string
  }
  readonly clock?: DesktopNotificationClock
  readonly notify: DesktopNotificationSink
  readonly open: (href: string) => void
}

const DEFAULT_BUDGET = 3

function parseHm(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/u.exec(value.trim())
  if (match === null) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return undefined
  return hours * 60 + minutes
}

/**
 * Whether `at` sits inside a quiet window. A wrap (22:00–07:00) includes midnight.
 * @param at - Instant.
 * @param start - HH:MM.
 * @param end - HH:MM.
 */
export function inQuietWindow(at: Date, start: string, end: string): boolean {
  const from = parseHm(start)
  const to = parseHm(end)
  if (from === undefined || to === undefined || from === to) return false
  const minutes = at.getHours() * 60 + at.getMinutes()
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to
}

function dayKey(at: Date): string {
  return `${String(at.getFullYear())}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

function formatCount(template: string, count: number): string {
  return template.replaceAll('{count}', String(count))
}

/**
 * Native toasts that refuse to spam: budget, silence, grouping. No network.
 */
export class DesktopNotifications {
  private shownToday = 0
  private day = ''
  private pending: DesktopAttentionEvent[] = []
  private readonly seen = new Set<string>()

  /** @param options - Policy, locale, injectable Notification, deep-link opener. */
  constructor(private readonly options: DesktopNotificationsOptions) {}

  /**
   * Consider one attention event. May show a toast or hold it for a summary.
   * @param event - Needs-you or review-ready.
   */
  ingest(event: DesktopAttentionEvent): void {
    if (this.seen.has(event.id)) return
    this.seen.add(event.id)
    const now = this.options.clock?.now() ?? new Date()
    this.rollDay(now)
    const policy = this.options.policy()
    if (inQuietWindow(now, policy.quietStart, policy.quietEnd)) {
      this.pending.push(event)
      return
    }
    const budget = policy.proposalBudget > 0 ? policy.proposalBudget : DEFAULT_BUDGET
    if (this.shownToday >= budget) {
      this.pending.push(event)
      return
    }
    if (policy.delivery === 'summary') {
      this.pending.push(event)
      return
    }
    this.showOne(event)
  }

  /** Flush held events as one grouped toast when the silence window ends. */
  flush(): void {
    this.flushSummary(this.options.clock?.now() ?? new Date())
  }

  private rollDay(now: Date): void {
    const key = dayKey(now)
    if (this.day === key) return
    this.day = key
    this.shownToday = 0
  }

  private flushSummary(now: Date): void {
    if (this.pending.length === 0) return
    const policy = this.options.policy()
    if (inQuietWindow(now, policy.quietStart, policy.quietEnd)) return
    const budget = policy.proposalBudget > 0 ? policy.proposalBudget : DEFAULT_BUDGET
    if (this.shownToday >= budget) return
    const held = this.pending
    this.pending = []
    const first = held[0]
    if (first === undefined) return
    const locale = this.options.locale()
    if (held.length === 1) {
      this.showOne(first)
      return
    }
    this.shownToday += 1
    const href = personaTaskHref(first.ticketId)
    const toast = this.options.notify.show({
      title: locale.needsYouTitle,
      body: formatCount(locale.notifyGroupedBody, held.length),
      href,
      tag: 'persona-attention',
    })
    toast.onClick = (link) => { this.options.open(link) }
  }

  private showOne(event: DesktopAttentionEvent): void {
    const locale = this.options.locale()
    const title = event.kind === 'review' ? locale.reviewReadyTitle : locale.needsYouTitle
    const href = personaTaskHref(event.ticketId)
    this.shownToday += 1
    const toast = this.options.notify.show({
      title,
      body: event.title,
      href,
      tag: `persona-${event.kind}-${event.ticketId}`,
    })
    toast.onClick = (link) => { this.options.open(link) }
  }
}

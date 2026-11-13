/** Honest Windows toasts: attention budget, silence windows, grouping, internal deep links. */

import { personaTaskHref, type PersonaLinkView } from './deep-link.ts'
import { nativeNotificationMessages } from './notification-locale.ts'

/** Where a click on this kind of toast lands (NOTIFICATIONS-SPEC §3). `thread` is the default and carries no query. */
function linkViewOf(kind: 'needs-you' | 'review' | 'question' | 'failed' | 'done'): PersonaLinkView {
  if (kind === 'needs-you') return 'approvals'
  if (kind === 'review') return 'review'
  return 'thread'
}

/** One "Janela de silêncio" the person saved: HH:MM to HH:MM (a wrap such as 20:00–08:00 includes midnight; the end is exclusive). */
export interface QuietWindow {
  readonly start: string
  readonly end: string
}

/** Policy from Anvil Remote `getAttentionPolicy` (Status contract). */
export interface DesktopAttentionPolicy {
  readonly delivery: 'summary' | 'ping'
  readonly proposalBudget: number
  readonly quietStart: string
  readonly quietEnd: string
  /**
   * HONEST-1: the windows the person SAVED. When present they replace `quietStart`/`quietEnd`: no window means no silence, and any of
   * several windows holds the toast.
   */
  readonly quietWindows?: readonly QuietWindow[]
}

export interface DesktopAttentionEvent {
  readonly id: string
  readonly kind: 'needs-you' | 'review' | 'question' | 'failed' | 'done'
  readonly title: string
  readonly ticketId: string
  readonly at: string
  readonly personaName?: string
  readonly avatarId?: string
  readonly question?: string
  readonly code?: string
  readonly threadId?: string
  readonly streamId?: string
}

export interface DesktopNotificationPayload {
  readonly title: string
  readonly body: string
  readonly href: string
  readonly tag: string
  readonly avatarId?: string
}

export interface DesktopNotificationClock {
  now(): Date
}

export interface DesktopNotificationSink {
  show(payload: DesktopNotificationPayload): { onClick?: (href: string) => void }
}

export interface DesktopNotificationsOptions {
  readonly policy: () => DesktopAttentionPolicy
  readonly clock?: DesktopNotificationClock
  readonly localeId?: () => string
  /** True only while a visible Persona window has keyboard focus. */
  readonly isAppFocused: () => boolean
  readonly notify: DesktopNotificationSink
  readonly open: (href: string) => void
}

const DEFAULT_BUDGET = 3

/** Anvil Remote `getAutonomy` fields (silence*) plus the desktop quiet aliases. */
export interface AutonomyNotifyPolicy {
  readonly delivery?: 'summary' | 'ping'
  readonly proposalBudget?: number
  readonly silenceStart?: string
  readonly silenceEnd?: string
  readonly quietStart?: string
  readonly quietEnd?: string
}

/**
 * Map host autonomy onto toast policy. Missing times fall back to 22:00–07:00.
 * @param raw - Anvil `getAutonomy` (or a test fixture).
 */
export function policyFromAutonomy(raw: AutonomyNotifyPolicy = {}): DesktopAttentionPolicy {
  return {
    delivery: raw.delivery === 'ping' ? 'ping' : 'summary',
    proposalBudget: raw.proposalBudget !== undefined && raw.proposalBudget > 0 ? raw.proposalBudget : DEFAULT_BUDGET,
    quietStart: raw.quietStart ?? raw.silenceStart ?? '22:00',
    quietEnd: raw.quietEnd ?? raw.silenceEnd ?? '07:00',
  }
}

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

/**
 * The toast policy of the desktop from the quiet windows the person saved (HONEST-1, Atlas 11/11). Nothing is held in secret: with no
 * window
 * there is no silence. Delivery and budget are the ones the desktop always used.
 * @param windows - The saved windows (`listQuietWindows`, sent by the renderer on the attention channel).
 */
export function toastPolicyFrom(windows: readonly QuietWindow[]): DesktopAttentionPolicy {
  return { delivery: 'ping', proposalBudget: DEFAULT_BUDGET, quietStart: '00:00', quietEnd: '00:00', quietWindows: windows }
}

/**
 * Whether `at` is held by the policy: any saved window, or (policies without windows) the single quiet window.
 * @param at - Instant.
 * @param policy - Toast policy.
 */
export function inQuietPolicy(at: Date, policy: DesktopAttentionPolicy): boolean {
  if (policy.quietWindows !== undefined) return policy.quietWindows.some(window => inQuietWindow(at, window.start, window.end))
  return inQuietWindow(at, policy.quietStart, policy.quietEnd)
}

function dayKey(at: Date): string {
  return `${String(at.getFullYear())}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
}

function formatCount(template: string, count: number): string {
  return template.replaceAll('{count}', String(count))
}

function trimText(text: string): string {
  const chars = Array.from(text.trim())
  return chars.length > 80 ? `${chars.slice(0, 79).join('')}…` : chars.join('')
}

/**
 * Native toasts that refuse to spam: budget, silence, grouping. No network.
 */
export class DesktopNotifications {
  private shownToday = 0
  private day = ''
  private pending: DesktopAttentionEvent[] = []
  private quietPending = false
  private readonly seen = new Set<string>()

  /** @param options - Policy, locale ID, focus, native notification sink and deep-link opener. */
  constructor(private readonly options: DesktopNotificationsOptions) {}

  /**
   * Consider one attention event. May show a toast or hold it for a summary.
   * @param event - Needs-you or review-ready.
   */
  ingest(event: DesktopAttentionEvent): void {
    if (this.seen.has(event.id)) return
    this.seen.add(event.id)
    if (this.options.isAppFocused()) return
    const now = this.options.clock?.now() ?? new Date()
    this.rollDay(now)
    const policy = this.options.policy()
    if (inQuietPolicy(now, policy)) {
      this.pending.push(event)
      this.quietPending = true
      return
    }
    const budget = policy.proposalBudget > 0 ? policy.proposalBudget : DEFAULT_BUDGET
    const limited = event.kind === 'review' || event.kind === 'done'
    if (limited && this.shownToday >= budget) {
      this.pending.push(event)
      return
    }
    if (limited && policy.delivery === 'summary') {
      this.pending.push(event)
      return
    }
    this.showOne(event)
  }

  /** Flush held events as one grouped toast when the silence window ends. */
  flush(): void {
    this.flushSummary(this.options.clock?.now() ?? new Date())
  }

  /** Release events held during quiet hours when the app is no longer focused. */
  flushQuietHours(): void {
    if (!this.quietPending) return
    const now = this.options.clock?.now() ?? new Date()
    const policy = this.options.policy()
    if (this.options.isAppFocused() || inQuietPolicy(now, policy)) return
    this.flushSummary(now)
    this.quietPending = false
  }

  /** Remove resolved events before they can appear in a later summary. */
  resolve(ids: readonly string[]): void {
    const resolved = new Set(ids)
    this.pending = this.pending.filter(event => !resolved.has(event.id))
    if (this.pending.length === 0) this.quietPending = false
  }

  private rollDay(now: Date): void {
    const key = dayKey(now)
    if (this.day === key) return
    this.day = key
    this.shownToday = 0
  }

  private flushSummary(now: Date): void {
    if (this.pending.length === 0) return
    if (this.options.isAppFocused()) return
    const policy = this.options.policy()
    if (inQuietPolicy(now, policy)) return
    const held = this.pending
    this.pending = []
    const first = held[0]
    if (first === undefined) return
    const locale = nativeNotificationMessages(this.options.localeId?.() ?? 'en')
    // The grouped toast opens the overview, not one arbitrary task (SPEC §3).
    const href = personaTaskHref(first.ticketId, 'overview')
    const needs = held.filter(event => event.kind !== 'done' && event.kind !== 'review').length
    const done = held.length - needs
    const toast = this.options.notify.show({
      title: locale.grouped,
      body: `${formatCount(needs === 1 ? locale.needsOne : locale.needsMany, needs)} · ${formatCount(done === 1 ? locale.doneOne : locale.doneMany, done)}`,
      href,
      tag: 'persona-attention',
    })
    toast.onClick = (link) => { this.options.open(link) }
  }

  private showOne(event: DesktopAttentionEvent): void {
    const locale = nativeNotificationMessages(this.options.localeId?.() ?? 'en')
    const label = event.kind === 'needs-you' ? locale.needsYou : locale[event.kind]
    const title = label.replaceAll('{persona}', event.personaName ?? 'Persona')
    const task = trimText(event.title)
    const body = event.kind === 'review' ? locale.reviewBody.replaceAll('{task}', task)
      : event.kind === 'done' ? `“${task}”`
        : event.kind === 'question' ? trimText(event.question ?? task)
          : event.kind === 'failed' ? locale.failures[event.code ?? ''] ?? locale.unknownFailure : task
    const href = personaTaskHref(event.ticketId, linkViewOf(event.kind))
    if (event.kind === 'review' || event.kind === 'done') this.shownToday += 1
    const toast = this.options.notify.show({
      title,
      body,
      href,
      tag: `persona-${event.kind}-${event.ticketId}`,
      ...(event.avatarId === undefined ? {} : { avatarId: event.avatarId }),
    })
    toast.onClick = (link) => { this.options.open(link) }
  }
}

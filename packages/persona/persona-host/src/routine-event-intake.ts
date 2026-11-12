/**
 * Item 26 onda A (26.15 + 26.16): where an event of a connected source meets the routines that listen to it.
 *
 * The external poll hands its triggers here BEFORE the engine sees them. For each one:
 *   1. the FILTER runs first, in code: a trigger no routine asked for goes on to the normal conversation path, untouched (0 cost added);
 *   2. a trigger a routine asked for becomes ONE pending `routine_run` of that routine (id {@link eventRunIdOf}) plus a small document with the
 *      event as fenced external data. The scheduler claims it through the same `claimDue` a due time uses: there is no second way to run a routine;
 *   3. the same event never starts the same routine twice (the run id is the key), and a routine starts at most {@link EVENT_RUNS_PER_HOUR} times
 *      an hour (a mailbox that spills 200 mails must not become 200 model calls).
 * A trigger taken by a routine is NOT also handed to the engine as a conversation: the person asked for the routine to handle it.
 * Nothing here calls a model, writes to the thread, or sends anything.
 */

import type { Trigger } from '@deepseek-ai/dsh-persona-engine'
import type { RoutineRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import {
  VAULT_CALDAV, VAULT_DISCORD, VAULT_IMAP, VAULT_SLACK, VAULT_TELEGRAM,
} from '@deepseek-ai/dsh-persona-vault'
import { ROUTINE_SPEC_KIND } from './proactivity-scheduler.ts'
import {
  EVENT_DOC_KIND, eventEnvelope, eventFacts, eventMatches, eventRunIdOf, isEventRunId, triggerOfRoutine,
  type EventSource, type RoutineEventDoc, type RoutineEventTrigger,
} from './routine-events.ts'

/** The most event runs one routine starts in a rolling hour. */
export const EVENT_RUNS_PER_HOUR = 6
const HOUR_MS = 3_600_000
/**
 * Sources that are read WITH A CURSOR: the offset moves past an update the moment it is read, so an event dropped here is gone for good (P1-07). A mailbox is not one: unread mail stays unread and is
 * taken again after the hour. Above the limit a cursor source POSTPONES the run instead of dropping it.
 */
const CURSOR_SOURCES: ReadonlySet<EventSource> = new Set<EventSource>(['telegram'])
/** The most postponed runs one routine keeps waiting; past that the rest is dropped, and said. */
const MAX_WAITING = 50

/** The Cofre slot (provider key) each source's credential lives in: a routine listens only to a source the person connected. */
export const SOURCE_PROVIDER: Readonly<Record<EventSource, string>> = {
  email: VAULT_IMAP, telegram: VAULT_TELEGRAM, slack: VAULT_SLACK, discord: VAULT_DISCORD, calendar: VAULT_CALDAV,
}

/** How the refusal names what is not connected yet ("conecte o Telegram em Conexões"). */
export const SOURCE_CONNECT_LABEL: Readonly<Record<EventSource, string>> = {
  email: 'o e-mail da empresa', telegram: 'o Telegram', slack: 'o Slack', discord: 'o Discord', calendar: 'a agenda',
}

/** What the intake needs from the host. */
export interface EventIntakeDeps {
  readonly routines: Pick<RoutineRepos, 'list' | 'listRuns' | 'schedule'>
  readonly screens: ScreenRepos
  readonly now: () => string
  /** One audit row ("Enquanto você estava fora"). `id` makes it idempotent. */
  readonly audit: (row: { readonly projectId: string; readonly id: string; readonly at: string; readonly subjectId: string; readonly detail: string }) => void
}

/** What one pass did. */
export interface EventIntakeResult {
  /** The triggers no routine took: they go on to the engine exactly as before. */
  readonly rest: Trigger[]
  /** Runs queued for the scheduler. */
  readonly started: number
  /** Matches left out: already seen, or over the hourly limit. */
  readonly left: number
}

interface Listener {
  readonly id: string
  readonly name: string
  readonly trigger: RoutineEventTrigger
}

export class RoutineEventIntake {
  constructor(private readonly deps: EventIntakeDeps) {}

  /**
   * @param projectId - Tenant whose sources were just read.
   * @param triggers - What the sources produced, already read at the origin.
   */
  take(projectId: string, triggers: readonly Trigger[]): EventIntakeResult {
    const listeners = this.listenersOf(projectId)
    if (listeners.length === 0) return { rest: [...triggers], started: 0, left: 0 }
    const rest: Trigger[] = []
    let started = 0
    let left = 0
    for (const trigger of triggers) {
      const facts = eventFacts(trigger)
      const wanted = listeners.filter(listener => eventMatches(listener.trigger, facts))
      if (wanted.length === 0) { rest.push(trigger); continue }
      const text = eventEnvelope(facts)
      for (const listener of wanted) {
        if (this.queue(projectId, listener, trigger.id, facts.source ?? listener.trigger.source, text)) started += 1
        else left += 1
      }
    }
    return { rest, started, left }
  }

  /** Routines that listen, as the scheduler would see them: live (not paused), event-driven by their row AND by a valid spec. */
  private listenersOf(projectId: string): Listener[] {
    const out: Listener[] = []
    for (const routine of this.deps.routines.list(projectId)) {
      if (routine.paused) continue
      const spec = this.deps.screens.get<{ readonly trigger?: unknown }>(projectId, ROUTINE_SPEC_KIND, routine.id)
      const trigger = triggerOfRoutine(routine.rrule, spec?.trigger)
      if (trigger.kind === 'event') out.push({ id: routine.id, name: routine.name, trigger })
    }
    return out
  }

  /** @returns Whether a new run was queued (false: this event already started this routine, or the hour is full). */
  private queue(projectId: string, listener: Listener, eventId: string, source: EventSource, text: string): boolean {
    const nowIso = this.deps.now()
    const nowMs = Date.parse(nowIso)
    const runId = eventRunIdOf(listener.id, eventId)
    const runs = this.deps.routines.listRuns(listener.id)
    if (runs.some(run => run.id === runId)) return false
    const lately = runs.filter(run => isEventRunId(run.id) && Date.parse(run.scheduledFor) > nowMs - HOUR_MS).length
    let opensAt = nowMs
    if (lately >= EVENT_RUNS_PER_HOUR && CURSOR_SOURCES.has(source)) {
      // P1-07: this event is not coming back (the cursor moved past it): it WAITS for the hour to have room instead of being dropped.
      const waiting = runs.filter(run => isEventRunId(run.id) && Date.parse(run.scheduledFor) > nowMs + 1_000).length // (the few-ms stagger of runs that start now does not count)
      if (waiting >= MAX_WAITING) {
        this.deps.audit({
          projectId, id: `sched:routine_skipped:${listener.id}:full:${String(Math.floor(nowMs / HOUR_MS))}`, at: nowIso, subjectId: listener.id,
          detail: `A rotina “${listener.name}” já tem ${String(MAX_WAITING)} eventos esperando a vez: os que não cabem foram perdidos (perdi mensagens). Aumente o limite ou chame menos eventos.`,
        })
        return false
      }
      const recent = runs.filter(run => isEventRunId(run.id) && Date.parse(run.scheduledFor) > nowMs - HOUR_MS).map(run => Date.parse(run.scheduledFor)).sort((a, b) => a - b)
      opensAt = Math.max(nowMs, (recent[lately - EVENT_RUNS_PER_HOUR] ?? nowMs) + HOUR_MS) // the hour has room once enough of the oldest runs age out
      this.deps.audit({
        projectId, id: `sched:routine_skipped:${listener.id}:wait:${String(Math.floor(nowMs / HOUR_MS))}`, at: nowIso, subjectId: listener.id,
        detail: `A rotina “${listener.name}” já começou ${String(EVENT_RUNS_PER_HOUR)} vezes na última hora: os eventos a mais ficaram adiados e rodam quando a hora tiver vaga (nenhum foi perdido).`,
      })
    } else if (lately >= EVENT_RUNS_PER_HOUR) {
      this.deps.audit({
        projectId, id: `sched:routine_skipped:${listener.id}:cap:${String(Math.floor(nowMs / HOUR_MS))}`, at: nowIso, subjectId: listener.id,
        detail: `A rotina “${listener.name}” já começou ${String(EVENT_RUNS_PER_HOUR)} vezes na última hora: os eventos a mais não rodaram.`,
      })
      return false
    }
    // One run per (routine, instant): two events in the same millisecond must not swallow each other.
    const taken = new Set(runs.map(run => run.scheduledFor))
    let at = Math.max(nowMs, opensAt)
    while (taken.has(new Date(at).toISOString())) at += 1
    const doc: RoutineEventDoc = { source, eventId, text }
    this.deps.screens.put(projectId, EVENT_DOC_KIND, runId, doc)
    this.deps.routines.schedule({ id: runId, routineId: listener.id, scheduledFor: new Date(at).toISOString() })
    return true
  }
}

/**
 * D-090 / TEAM-7 — "Bom dia", the morning meeting, at zero cost. The facts (what finished yesterday, who is on what today, what waits for
 * the person) are summarized by a PURE function of the engine (`buildMorningBrief`, Tally): no model can be called from here. This module
 * is the host half: the team routine "Resumo da manhã" (ON for every team, the person can only pause it), WHEN the card goes out (the first
 * time the app is opened after 6:00, else at 9:00; at most once a day; never after noon; only when there is something to say), the card
 * in #geral, and what the thread returns as `MessageView.dailyBrief`. Inert unless `Config.teamwork` is on.
 *
 * What the card carries is only the ids and titles of the Tasks and the numbers (LEAK-1): never a prompt, an assignment or a bilhete.
 */

import {
  briefDueNow,
  briefVariant,
  buildMorningBrief,
  dayBounds,
  renderMorningText,
  type BriefVariant,
  type MorningBriefResult,
  type MorningTask,
} from '@deepseek-ai/dsh-persona-engine'
import type { EventRepos, ProductRepos, RoutineRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { DailyBriefNowOutcome, DailyBriefRequestView, DailyBriefView } from './types.ts'

/** The id of the team routine of a project, so it shows in Rotinas and can be paused. */
export const MORNING_ROUTINE_PREFIX = 'morning-brief:'
const DOC_KIND = 'morning_brief'
const STATE_KIND = 'morning_brief_state'
/** "Bom dia" is a morning ritual: after noon nothing goes out (the next day brings the next one). */
const LAST_MINUTE_OF_THE_MORNING = 12 * 60

/** What is kept of the last card: the day, when, and the signature the "nothing changed" rule compares. */
interface LastBrief {
  readonly day: string
  readonly at: string
  readonly signature: string
  /** The thread message of that card: a request "by hand" for the same facts answers with it (`already`) instead of a second card. */
  readonly eventId?: string
}

/** What building a card ended in: the outcome, and — `already` — the card that already says the same. */
type PublishResult = { readonly outcome: PublishOutcome } | { readonly outcome: 'already'; readonly messageId: string }

/** What is kept of a card, by the id of the thread message. */
interface BriefDoc {
  readonly day: string
  readonly coordinatorPersonaId: string
  readonly routineId: string
  readonly yesterday: ReadonlyArray<MorningBriefResult['yesterday'][number] & { readonly request?: DailyBriefRequestView }>
  readonly yesterdayMore: number
  readonly today: MorningBriefResult['today']
  readonly needsYou: MorningBriefResult['needsYou']
  /** Which card this is: the morning's ("Bom dia") or one asked for by hand after noon ("Resumo do dia"). Cards written before this field are the morning's. */
  readonly variant?: BriefVariant
}

/** Why a check posted nothing (for tests and the audit; the person never sees "nothing happened"). */
export type BriefOutcome = 'posted' | 'off' | 'paused' | 'not-due' | 'nothing-to-say' | 'no-coordination' | 'no-channel'

/** What building and posting a card can end in (the schedule's answers `off`/`paused`/`not-due` come before it). */
type PublishOutcome = 'posted' | 'nothing-to-say' | 'no-coordination' | 'no-channel'

/** What an explicit "Bom dia agora" answers: the card was posted, it already was (idempotent), or why there is none. */
export type NowOutcome = DailyBriefNowOutcome

/** The readable fallback of each answer (the UI writes its own words from `outcome`). */
export const NOW_TEXT: Readonly<Record<NowOutcome, string>> = {
  posted: 'O resumo do dia está na conversa.',
  already: 'O resumo de hoje já está na conversa.',
  'nothing-to-say': 'Ainda não há o que resumir: ninguém terminou nada ontem, ninguém está ocupado e nada espera você.',
  off: 'Esta equipe ainda não faz o resumo do dia.',
  'no-coordination': 'Escolha quem coordena a equipe para receber o resumo do dia.',
  'no-channel': 'Não achei a conversa #geral para postar o resumo.',
}

/** Host parts the module reads and writes. */
export interface MorningBriefDeps {
  /** `Config.teamwork`. */
  readonly enabled: () => boolean
  readonly now: () => string
  /** Minutes the person's local time is ahead of UTC at `nowIso` (São Paulo: -180). */
  readonly offsetMinutes: (nowIso: string) => number
  readonly product: Pick<ProductRepos, 'getProject' | 'listPersonas' | 'listChannels'>
  readonly events: Pick<EventRepos, 'append' | 'has'>
  readonly screens: ScreenRepos
  readonly routines: Pick<RoutineRepos, 'create' | 'get'>
  /** The Tasks of the project as plain facts (the host maps its tickets; no other field leaves). */
  readonly tasks: (projectId: string) => readonly MorningTask[]
  /** Approvals + questions + reviews that wait for the person. */
  readonly needsYou: (projectId: string) => number
  /** The finished REQUEST a line stands for (its name, the short names of its parts and who did them); undefined for a single Task. */
  readonly requestOf?: (projectId: string, taskId: string) => DailyBriefRequestView | undefined
  /** IANA zone of the person, for the routine's schedule. */
  readonly timeZone: () => string
}

/** The host half of the morning meeting. */
export class MorningBriefHost {
  /** @param deps - Host parts. */
  constructor(private readonly deps: MorningBriefDeps) {}

  /** @param projectId - Tenant. @returns The id of its "Resumo da manhã" routine. */
  routineIdOf(projectId: string): string {
    return `${MORNING_ROUTINE_PREFIX}${projectId}`
  }

  /**
   * The team keeps the routine ready and ON in every project; creating it is idempotent. It exists so the person SEES the ritual in Rotinas
   * and can pause it — the card itself is posted by {@link check}, never by a model Task.
   * @param projectId - Tenant.
   */
  ensureRoutine(projectId: string): void {
    const project = this.deps.product.getProject(projectId)
    const id = this.routineIdOf(projectId)
    if (project === undefined || this.deps.routines.get(id) !== undefined) return
    this.deps.routines.create({
      id, workspaceId: project.workspaceId, projectId, name: 'Resumo da manhã',
      rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0', timeZone: this.deps.timeZone(), catchUp: 'skip',
    })
  }

  /** @param projectId - Tenant. @returns True when the person paused the routine. */
  paused(projectId: string): boolean {
    return this.deps.routines.get(this.routineIdOf(projectId))?.paused === true
  }

  /** The person's local clock at this instant: what the schedule and the card's day are computed from. */
  private clock(): { readonly nowIso: string; readonly offset: number; readonly day: string; readonly localMinutes: number } {
    const nowIso = this.deps.now()
    const offset = this.deps.offsetMinutes(nowIso)
    const local = new Date(Date.parse(nowIso) + offset * 60_000)
    return { nowIso, offset, day: local.toISOString().slice(0, 10), localMinutes: local.getUTCHours() * 60 + local.getUTCMinutes() }
  }

  /**
   * Post the card if it is time and there is something to say.
   * @param projectId - Tenant.
   * @param event - `app-open`: the person just opened the app; `tick`: the host's clock.
   */
  check(projectId: string, event: 'app-open' | 'tick'): BriefOutcome {
    const { deps } = this
    if (!deps.enabled()) return 'off'
    this.ensureRoutine(projectId)
    if (this.paused(projectId)) return 'paused'
    const when = this.clock()
    const last = deps.screens.get<LastBrief>(projectId, STATE_KIND, 'last')
    if (when.localMinutes >= LAST_MINUTE_OF_THE_MORNING
      || !briefDueNow({ event, localMinutes: when.localMinutes, day: when.day, ...(last === undefined ? {} : { lastBriefDay: last.day }) })) return 'not-due'
    const eventId = `morning-brief:${projectId}:${when.day}`
    if (deps.events.has(eventId)) return 'not-due' // one a day, even if the state was lost
    const result = this.publish(projectId, eventId, when, last, false, 'schedule')
    return result.outcome === 'already' ? 'not-due' : result.outcome
  }

  /**
   * "Bom dia" NOW, on the person's (or a test's) request: the same card, the same zero-model facts, with no clock window and no
   * "nothing changed" rule (asking is a reason to be told). Idempotent: the day's card is posted once (`already` after that, with the
   * message it is); a `requestId` asks for one more card of its own (the same `requestId` returns the same card). Pausing the morning
   * routine stops the automatic card only — an explicit ask is still answered. Never a model call.
   * @param projectId - Tenant.
   * @param requestId - Optional: this ask's own key (`[A-Za-z0-9_-]`, checked by the Remote).
   */
  postNow(projectId: string, requestId?: string): { readonly outcome: NowOutcome; readonly messageId?: string } {
    const { deps } = this
    if (!deps.enabled()) return { outcome: 'off' }
    this.ensureRoutine(projectId)
    const when = this.clock()
    const dayId = `morning-brief:${projectId}:${when.day}`
    const eventId = requestId === undefined ? dayId : `${dayId}:ask:${requestId}`
    if (deps.events.has(eventId)) return { outcome: 'already', messageId: eventId }
    const result = this.publish(projectId, eventId, when, deps.screens.get<LastBrief>(projectId, STATE_KIND, 'last'), true, 'on-demand')
    if (result.outcome === 'already') return { outcome: 'already', messageId: result.messageId }
    return result.outcome === 'posted' ? { outcome: 'posted', messageId: eventId } : { outcome: result.outcome }
  }

  /** Build the card, post it in #geral as the Coordenação and remember it. `fresh` skips the "nothing changed since the last card" rule. */
  private publish(
    projectId: string,
    eventId: string,
    when: { readonly nowIso: string; readonly offset: number; readonly day: string; readonly localMinutes: number },
    last: LastBrief | undefined,
    fresh: boolean,
    trigger: 'schedule' | 'on-demand',
  ): PublishResult {
    const { deps } = this
    const { nowIso, offset, day } = when
    const coordination = deps.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
    if (coordination === undefined) return { outcome: 'no-coordination' }
    const channel = deps.product.listChannels(projectId).find(row => row.name === 'geral')
    const project = deps.product.getProject(projectId)
    if (channel === undefined || project === undefined) return { outcome: 'no-channel' }
    const previous = dayBounds(day, offset, deps.offsetMinutes(new Date(Date.parse(nowIso) - 86_400_000).toISOString()))
    const brief = buildMorningBrief({
      day, ...previous, tasks: deps.tasks(projectId), needsYouCount: deps.needsYou(projectId),
      variant: briefVariant({ trigger, localMinutes: when.localMinutes }),
      ...(last === undefined || fresh ? {} : { lastBrief: { at: last.at, signature: last.signature } }),
    })
    if (brief === undefined) return { outcome: 'nothing-to-say' }
    // Asked by hand when NOTHING changed since the card of today (the facts hash to the same signature): that card is the answer — no second one (Muse).
    if (trigger === 'on-demand' && last !== undefined && last.day === day && last.signature === brief.signature && last.eventId !== undefined) {
      return { outcome: 'already', messageId: last.eventId }
    }
    const names: Record<string, string> = {}
    for (const persona of deps.product.listPersonas(projectId)) names[persona.id] = persona.name
    deps.events.append({
      id: eventId, workspaceId: project.workspaceId, projectId, streamKind: 'channel', ownerId: channel.id, type: 'message',
      body: renderMorningText(brief, names), actorId: coordination.id, subjectId: 'morning-brief', occurredAt: nowIso,
    })
    const doc: BriefDoc = {
      day, coordinatorPersonaId: coordination.id, routineId: this.routineIdOf(projectId),
      yesterday: brief.yesterday.map((line) => {
        const request = deps.requestOf?.(projectId, line.taskId)
        return request === undefined ? line : { ...line, request }
      }),
      yesterdayMore: brief.yesterdayMore, today: brief.today, needsYou: brief.needsYou, variant: brief.variant,
    }
    deps.screens.put(projectId, DOC_KIND, eventId, doc)
    deps.screens.put(projectId, STATE_KIND, 'last', { day, at: nowIso, signature: brief.signature, eventId } satisfies LastBrief)
    return { outcome: 'posted' }
  }

  /**
   * The card of a thread message, when it is one. `paused` is live (the person may pause after it went out).
   * @param projectId - Tenant.
   * @param eventId - The thread message.
   */
  viewOf(projectId: string, eventId: string): DailyBriefView | undefined {
    if (!this.deps.enabled() || !eventId.startsWith('morning-brief:')) return undefined
    const doc = this.deps.screens.get<BriefDoc>(projectId, DOC_KIND, eventId)
    if (doc === undefined) return undefined
    return {
      day: doc.day, coordinatorPersonaId: doc.coordinatorPersonaId, yesterday: doc.yesterday, yesterdayMore: doc.yesterdayMore,
      today: doc.today, needsYou: doc.needsYou, paused: this.paused(projectId), routineId: doc.routineId, variant: doc.variant ?? 'morning',
    }
  }
}

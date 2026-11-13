/**
 * Marco DOGFOOD, M2 (persona-spec/contracts/marco-dogfood-host.md + .maestri/tmp/forge/marco/contrato-m2-m3.md): "may this turn start?" for a PROJECT.
 *
 * A project has a ceiling of turns and tokens per day. Below 95% of both everything runs. From 95% only the turns the person asked for keep running (the team's own work, the board loop, routines,
 * initiatives and hand-offs, pauses); at 100% nothing runs. The window is the host's local day (the same single clock the soak moves, in the host's own time zone) and the project resumes by itself
 * when it turns over. The reserve of the subscription ACCOUNT (persona-usage) and the execution slots stay on top of it. Pure: every input is a port, so the whole rule is tested with a fake clock.
 */

import { backgroundWorkAllowed, ownerAnswerAllowed, type WindowReserve } from '@deepseek-ai/dsh-persona-usage'

/** Who asks for the turn: the person, or the team's own work (the board loop `quadro`, a routine, an initiative, a hand-off between colleagues). */
export type TurnOrigin = 'person' | 'quadro' | 'routine' | 'initiative' | 'handoff'

/** What a project may spend in a day. */
export interface ProjectCeiling {
  /** Turns of a model per day (every admitted turn counts). */
  readonly turnsPerDay: number
  /** Tokens per day (input + output); 0 = no ceiling (the account window reserve still protects). */
  readonly tokensPerDay: number
  /** The share of the day's ceiling at which the team's own work pauses (default 95). */
  readonly pausePct: number
}

/** The ceiling of a project nobody configured. */
export const DEFAULT_CEILING: ProjectCeiling = { turnsPerDay: 200, tokensPerDay: 0, pausePct: 95 }

/** `open`: all runs. `reserve`: only the person's turns. `full`: nothing runs until the window turns over. */
export type ProjectLoadState = 'open' | 'reserve' | 'full'

/** How loaded a project is right now (read-only: for the Casa, the "quem está cuidando de quê" view and the tests). */
export interface ProjectLoad {
  readonly state: ProjectLoadState
  readonly turns: { readonly used: number; readonly max: number }
  readonly tokens: { readonly used: number; readonly max: number }
  /** The larger of the two shares, 0-100+ (a ceiling of 0 counts as no ceiling). */
  readonly pct: number
  /** When the window turns over and the project resumes (ISO). */
  readonly resumeAt: string
  /** The local day this window is (`YYYY-MM-DD`). */
  readonly windowKey: string
}

export type RefusalReason = 'project-reserve' | 'project-full' | 'account-window' | 'slots'

export type Admission =
  | { readonly ok: true; readonly load: ProjectLoad }
  | { readonly ok: false; readonly why: RefusalReason; readonly resumeAt?: string; readonly load: ProjectLoad }

/** What the host tells the person and the trail about a project's pause: once per (project, day, reason, kind). */
export interface ProjectPauseEvent {
  readonly projectId: string
  readonly at: string
  readonly kind: 'pause' | 'full' | 'resume'
  readonly reason: 'turns' | 'quota'
  readonly pct: number
  readonly resumeAt: string
  readonly windowKey: string
  /** Deterministic: `project-pause:<project>:<day>:<turns|quota>` (the one line in the channel and the trail take it as their id/key). */
  readonly key: string
}

/** Durable memory of what was announced (a screen document in the host; a map in a test): it survives a restart of the host. */
export interface PauseJournal {
  has(mark: string): boolean
  put(mark: string, event: ProjectPauseEvent): void
  /** The events of a project, oldest first. */
  list(projectId: string): readonly ProjectPauseEvent[]
}

/** The ports of the rule. */
export interface ProjectAdmissionDeps {
  /** The host's single clock (ISO). */
  readonly now: () => string
  /** The host's own time zone: minutes EAST of UTC at that instant (`PersonaHost.timezoneOffsetMinutes`). */
  readonly offsetMinutes: (iso: string) => number
  readonly ceilingOf: (projectId: string) => ProjectCeiling
  /** Turns already admitted in this window (durable). */
  readonly turnsOf: (projectId: string, windowKey: string) => number
  /** One more turn admitted (durable). `key` = the request it is for (so a request the host recovers is not counted twice). */
  readonly bump: (projectId: string, windowKey: string, key?: string) => void
  /** This request was already counted in this window (durable). Absent: every call counts. */
  readonly counted?: (projectId: string, windowKey: string, key: string) => boolean
  /** Tokens spent by the project between two instants (the turn ledger). */
  readonly tokensOf: (projectId: string, fromIso: string, toIso: string) => number
  /** The reserve of the account window the project's personas use. */
  readonly accountReserve: (projectId: string) => WindowReserve | undefined
  /** An execution slot is free for the project (does not take it). */
  readonly slotFree: (projectId: string) => boolean
  readonly journal: PauseJournal
  /** Told once per mark: the host posts the line in the channel and writes the trail here. */
  readonly onEvent?: (event: ProjectPauseEvent) => void
}

/** How a caller narrows one `admit`. */
export interface AdmitOptions {
  /** The request this turn is for: asked twice for the same request, it counts once (and is never refused after it was admitted). */
  readonly key?: string
  /** The caller queues for a slot by itself (the fair queue): a full slot table is not a refusal here. */
  readonly ignoreSlots?: boolean
}

const DAY_MS = 24 * 60 * 60 * 1000
const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * The local day of an instant.
 * @param iso - The instant.
 * @param offsetMinutes - Minutes east of UTC at that instant.
 * @returns Its key (`YYYY-MM-DD`) and the instants it starts and ends (ISO).
 */
function windowOf(iso: string, offsetMinutes: number): { readonly key: string; readonly start: string; readonly end: string } {
  const offset = offsetMinutes * 60_000
  const local = new Date(Date.parse(iso) + offset)
  const startMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset
  return {
    key: `${String(local.getUTCFullYear())}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    start: new Date(startMs).toISOString(), end: new Date(startMs + DAY_MS).toISOString(),
  }
}

/** Per-project admission with a daily ceiling and the 95% pause. */
export class ProjectAdmission {
  /** @param deps - The ports. */
  constructor(private readonly deps: ProjectAdmissionDeps) {}

  /**
   * How loaded a project is. No effect.
   * @param projectId - The project.
   * @returns Its load now.
   */
  loadOf(projectId: string): ProjectLoad {
    const ceiling = this.deps.ceilingOf(projectId)
    const now = this.deps.now()
    const window = windowOf(now, this.deps.offsetMinutes(now))
    const turnsUsed = this.deps.turnsOf(projectId, window.key)
    const tokensUsed = ceiling.tokensPerDay > 0 ? this.deps.tokensOf(projectId, window.start, window.end) : 0
    const turnsPct = ceiling.turnsPerDay > 0 ? (turnsUsed / ceiling.turnsPerDay) * 100 : 0
    const tokensPct = ceiling.tokensPerDay > 0 ? (tokensUsed / ceiling.tokensPerDay) * 100 : 0
    const pct = Math.max(turnsPct, tokensPct)
    const state: ProjectLoadState = pct >= 100 ? 'full' : pct >= ceiling.pausePct ? 'reserve' : 'open'
    return {
      state, pct,
      turns: { used: turnsUsed, max: ceiling.turnsPerDay }, tokens: { used: tokensUsed, max: ceiling.tokensPerDay },
      resumeAt: window.end, windowKey: window.key,
    }
  }

  /**
   * May a turn of this project start now? When it may, it is counted (the turn N+1 of the day never runs).
   * @param projectId - The project.
   * @param origin - Who asks.
   * @param options - The request this turn is for, and whether the caller queues for a slot itself.
   * @returns The load, or why not and when the project resumes.
   */
  admit(projectId: string, origin: TurnOrigin, options: AdmitOptions = {}): Admission {
    const load = this.loadOf(projectId)
    this.watch(projectId, load)
    if (options.key !== undefined && this.deps.counted?.(projectId, load.windowKey, options.key) === true) return { ok: true, load }
    const team = origin !== 'person'
    const refused = (why: RefusalReason, resumeAt?: string): Admission => ({ ok: false, why, ...(resumeAt === undefined ? {} : { resumeAt }), load })
    if (load.state === 'full') return refused('project-full', load.resumeAt)
    if (team && load.state === 'reserve') return refused('project-reserve', load.resumeAt)
    const reserve = this.deps.accountReserve(projectId)
    if (team ? !backgroundWorkAllowed(reserve) : !ownerAnswerAllowed(reserve)) return refused('account-window', reserve?.resetsAt)
    if (options.ignoreSlots !== true && !this.deps.slotFree(projectId)) return refused('slots')
    this.deps.bump(projectId, load.windowKey, options.key)
    return { ok: true, load: this.loadOf(projectId) }
  }

  /**
   * The look the scheduler takes at a project (no turn asked): the pause/resume line is told even if nobody asks for a turn, and the load comes back.
   * @param projectId - The project.
   * @returns Its load now.
   */
  sweep(projectId: string): ProjectLoad {
    const load = this.loadOf(projectId)
    this.watch(projectId, load)
    return load
  }

  /**
   * The pauses and resumes of a project, oldest first (durable: they survive a restart of the host).
   * @param projectId - The project.
   * @returns The events.
   */
  events(projectId: string): readonly ProjectPauseEvent[] {
    return this.deps.journal.list(projectId)
  }

  private tell(projectId: string, load: ProjectLoad, kind: ProjectPauseEvent['kind'], reason: 'turns' | 'quota'): void {
    const mark = `${projectId}|${load.windowKey}|${reason}|${kind}`
    if (this.deps.journal.has(mark)) return
    const event: ProjectPauseEvent = {
      projectId, at: this.deps.now(), kind, reason, pct: Math.round(load.pct), resumeAt: load.resumeAt, windowKey: load.windowKey,
      key: `project-pause:${projectId}:${load.windowKey}:${reason}`,
    }
    this.deps.journal.put(mark, event)
    this.deps.onEvent?.(event)
  }

  /** Announce the state: a pause/full once per (project, day, reason); a resume once on the first look of a new day at a project that was paused the day before (read from the journal). */
  private watch(projectId: string, load: ProjectLoad): void {
    const ceiling = this.deps.ceilingOf(projectId)
    const turnsShare = ceiling.turnsPerDay > 0 ? (load.turns.used / ceiling.turnsPerDay) * 100 : 0
    const reason: 'turns' | 'quota' = turnsShare >= ceiling.pausePct ? 'turns' : 'quota'
    if (load.state !== 'open') this.tell(projectId, load, load.state === 'full' ? 'full' : 'pause', reason)
    const now = this.deps.now()
    const yesterday = windowOf(new Date(Date.parse(now) - DAY_MS).toISOString(), this.deps.offsetMinutes(now)).key
    const paused = this.deps.journal.list(projectId).filter(event => event.windowKey === yesterday && event.kind !== 'resume').at(-1)
    if (paused !== undefined && load.windowKey !== paused.windowKey) this.tell(projectId, load, 'resume', paused.reason)
  }
}

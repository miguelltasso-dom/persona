/**
 * HONEST-1 (Atlas 11/11): the "Regras da casa" and the "Janela de silêncio" only promise what the host OBEYS.
 *
 * Three things live here, with no model and no network:
 *  1. The CLOSED list of rule kinds the host obeys ({@link HOUSE_RULE_KINDS}) — the screens show only these; free text is "anotado", never a promise.
 *     Each kind is a hard lock for the team: `never-spend`, `never-send`, `never-publish`, `never-delete` (the permission gate asks the person, whatever
 *     the autonomy or a permanent permission) and `never-hire` (the hire tool always goes through a card, never "contratar direto").
 *  2. The team's quiet window (`quiet_window` documents): one function, {@link HouseRules.quietNow}, built on the SAME silence arithmetic the Coordenação's
 *     silence uses (`proactivity.ts#silenceUntilOf`), read in the person's local time. Everything the team starts by itself asks it first.
 *  3. The books of "how many times did it really apply": per rule / window, a total, the last 7 days, the last time and what. Bounded, idempotent.
 *
 * Documents live in `screen_doc` (no migration): `triage_rule`, `quiet_window` (the screens' own) and `house_rule_applied` (the books).
 */

import { toolWords } from '@deepseek-ai/dsh-persona-runners'
import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import { silenceUntilOf } from './proactivity.ts'
import type { HouseRuleKind, HouseRuleKindView, QuietHold, QuietWindowView, RuleAppliedView, RuleKindsView, TriageRuleView } from './types.ts'

/** `screen_doc` kind of the saved rules (the screens' own). */
export const KIND_RULE = 'triage_rule'
/** `screen_doc` kind of the saved quiet windows (the screens' own). */
export const KIND_QUIET = 'quiet_window'
const KIND_APPLIED = 'house_rule_applied'

/** The newest applications kept per rule / window (the total never forgets; this is what "this week" is counted from). */
const RECENT_CAP = 200
/** The ids of the newest applications kept, so the same application is counted once. */
const IDS_CAP = 200
const WEEK_MS = 7 * 86_400_000

/** Words of a tool name that mean "put it out in public" (a subset of the gate's `send` class). */
export const PUBLISH_VERBS: readonly string[] = ['publish', 'post', 'tweet', 'broadcast', 'share']

/** What the host knows about one kind it obeys. */
export interface HouseRuleSpec {
  readonly kind: HouseRuleKind
  /** `gate`: the permission gate asks the person before the call runs. `harness`: the product's own tool refuses the shortcut. */
  readonly enforcedBy: HouseRuleKindView['enforcedBy']
  /** Classes of tool call the rule holds (the gate's `actionClass`). */
  readonly classes: readonly string[]
  /** Verbs the rule holds on top of the classes. */
  readonly verbs: readonly string[]
}

/** The CLOSED list. A kind not here is refused when saved and never offered. Order is the order of the screen. */
export const HOUSE_RULE_KINDS: readonly HouseRuleSpec[] = [
  { kind: 'never-spend', enforcedBy: 'gate', classes: ['pay'], verbs: [] },
  { kind: 'never-send', enforcedBy: 'gate', classes: ['send'], verbs: [] },
  { kind: 'never-publish', enforcedBy: 'gate', classes: [], verbs: PUBLISH_VERBS },
  { kind: 'never-delete', enforcedBy: 'gate', classes: ['delete'], verbs: [] },
  { kind: 'never-hire', enforcedBy: 'harness', classes: [], verbs: [] },
]

/** The verb of each kind, for the book's "what" ("pagar pelo Gmail"). */
export const KIND_VERB: Readonly<Record<HouseRuleKind, string>> = {
  'never-spend': 'pagar', 'never-send': 'enviar', 'never-publish': 'publicar', 'never-delete': 'apagar', 'never-hire': 'contratar',
}

/** What the team's quiet window holds back (each of these is enforced and has a spec). */
export const QUIET_HOLDS: readonly QuietHold[] = ['initiative', 'routine', 'plan', 'proposal', 'brief']

/**
 * @param value - Anything.
 * @returns Whether it is a kind the host obeys.
 */
export function isHouseRuleKind(value: unknown): value is HouseRuleKind {
  return typeof value === 'string' && HOUSE_RULE_KINDS.some(spec => spec.kind === value)
}

/** The contract of the screens: what the host obeys, and exactly what the quiet window does and does not do. */
export function ruleKindsView(): RuleKindsView {
  return {
    kinds: HOUSE_RULE_KINDS.map(spec => ({ kind: spec.kind, enforcedBy: spec.enforcedBy })),
    quietWindow: { enforced: true, holds: [...QUIET_HOLDS], directRequestsAnswered: true },
  }
}

/** The stored book of one rule or window. */
interface AppliedDoc {
  total: number
  /** ISO instants, ascending, at most {@link RECENT_CAP}. */
  recent: string[]
  ids: string[]
  lastAt?: string
  lastWhat?: string
}

/** The team's quiet window that is on now. */
export interface QuietNow {
  readonly id: string
  readonly label: string
  readonly start: string
  readonly end: string
  /** Epoch ms of the end of THIS occurrence of the window. */
  readonly untilMs: number
}

/** Rules, windows and their books for one host. */
export class HouseRules {
  /** Local-clock offset in minutes for an instant (the host sets its own, tests set a fixed one). Default: this machine's. */
  offsetMinutes: (nowIso: string) => number = nowIso => -new Date(nowIso).getTimezoneOffset()

  /**
   * @param screens - Document store.
   * @param now - Instant factory (the host replaces it with its own clock once it is built).
   */
  constructor(private readonly screens: ScreenRepos, public now: () => string) {}

  /** @param projectId - Tenant. @returns The saved rules as stored (with their `kind`, no books). */
  rules(projectId: string): TriageRuleView[] {
    return this.screens.list<TriageRuleView>(projectId, KIND_RULE)
  }

  /** @param projectId - Tenant. @returns The saved quiet windows as stored. */
  windows(projectId: string): QuietWindowView[] {
    return this.screens.list<QuietWindowView>(projectId, KIND_QUIET)
  }

  /**
   * The rules of one kind that are saved (a lock is ON while at least one exists).
   * @param projectId - Tenant.
   * @param kind - A kind of the closed list.
   */
  rulesOfKind(projectId: string, kind: HouseRuleKind): TriageRuleView[] {
    return this.rules(projectId).filter(rule => rule.kind === kind)
  }

  /**
   * The saved rules a tool call falls under.
   * @param projectId - Tenant.
   * @param call - The class and the verb the gate decided for the call.
   */
  matching(projectId: string, call: { readonly actionClass: string; readonly verb: string; readonly tool: string }): TriageRuleView[] {
    // Every whole word of the tool name counts, not only the one that decided the class (`send_tweet` is a tweet), exactly as the gate holds it.
    const words = new Set([call.verb.toLowerCase(), ...toolWords(call.tool)])
    return this.rules(projectId).filter((rule) => {
      const spec = HOUSE_RULE_KINDS.find(item => item.kind === rule.kind)
      return spec !== undefined && spec.enforcedBy === 'gate' && (spec.classes.includes(call.actionClass) || spec.verbs.some(word => words.has(word)))
    })
  }

  /**
   * The classes and verbs the saved rules of the project lock: what the gate must ask the person for, whatever the autonomy or a permission.
   * @param projectId - Tenant.
   */
  gateLocks(projectId: string): { readonly classes: readonly string[]; readonly verbs: readonly string[] } {
    const classes = new Set<string>()
    const verbs = new Set<string>()
    for (const rule of this.rules(projectId)) {
      const spec = HOUSE_RULE_KINDS.find(item => item.kind === rule.kind)
      if (spec === undefined || spec.enforcedBy !== 'gate') continue
      for (const name of spec.classes) classes.add(name)
      for (const name of spec.verbs) verbs.add(name)
    }
    return { classes: [...classes], verbs: [...verbs] }
  }

  /**
   * The team's quiet window that is on at `nowIso`, in the person's local time; the one that lasts longest when several overlap.
   * @param projectId - Tenant.
   * @param nowIso - Instant (default: now).
   */
  quietNow(projectId: string, nowIso: string = this.now()): QuietNow | undefined {
    const windows = this.windows(projectId)
    if (windows.length === 0) return undefined
    const offset = this.offsetMinutes(nowIso) * 60_000
    const localNow = Date.parse(nowIso)
    if (!Number.isFinite(localNow)) return undefined
    const local = new Date(localNow + offset).toISOString()
    let found: QuietNow | undefined
    for (const window of windows) {
      const end = silenceUntilOf(local, window.start, window.end)
      if (end <= 0) continue
      const untilMs = end - offset
      if (found === undefined || untilMs > found.untilMs) found = { id: window.id, label: window.label, start: window.start, end: window.end, untilMs }
    }
    return found
  }

  /**
   * Ask the quiet window for permission to start something the team would do BY ITSELF. When the window is on the thing is held back, and the hold is
   * written in the window's book (once per thing and per occurrence of the window, however many cycles look at it).
   * @param projectId - Tenant.
   * @param hold - What would start.
   * @param who - Who or what it is (a persona id, a routine id), for the idempotency and the book.
   * @param what - A few words for the book ("iniciativa de Nina").
   * @param nowIso - Instant (default: now).
   * @returns The window when the thing must wait; undefined when it may go.
   */
  hold(projectId: string, hold: QuietHold, who: string, what: string, nowIso: string = this.now()): QuietNow | undefined {
    const quiet = this.quietNow(projectId, nowIso)
    if (quiet === undefined) return undefined
    this.record(projectId, `quiet:${quiet.id}`, nowIso, what, `${hold}:${who}:${String(quiet.untilMs)}`)
    return quiet
  }

  /**
   * Write one application in the book of a rule (`<ruleId>`) or a window (`quiet:<windowId>`).
   * @param projectId - Tenant.
   * @param key - The rule id, or `quiet:<windowId>`.
   * @param at - When it applied.
   * @param what - A few words ("pagar pelo Gmail").
   * @param id - Stable id of THIS application (the tool call, the held thing): the same id is counted once.
   */
  record(projectId: string, key: string, at: string, what: string, id?: string): void {
    const doc = this.screens.get<AppliedDoc>(projectId, KIND_APPLIED, key) ?? { total: 0, recent: [], ids: [] }
    if (id !== undefined && doc.ids.includes(id)) return
    const recent = [...doc.recent, at].sort().slice(-RECENT_CAP)
    const newest = doc.lastAt === undefined || at >= doc.lastAt
    const next: AppliedDoc = {
      total: doc.total + 1,
      recent,
      ids: id === undefined ? doc.ids : [...doc.ids, id].slice(-IDS_CAP),
      lastAt: newest ? at : doc.lastAt!,
      lastWhat: newest ? what : doc.lastWhat ?? what,
    }
    this.screens.put(projectId, KIND_APPLIED, key, next)
  }

  /**
   * @param projectId - Tenant.
   * @param key - The rule id, or `quiet:<windowId>`.
   * @returns How many times it really applied.
   */
  appliedOf(projectId: string, key: string): RuleAppliedView {
    const doc = this.screens.get<AppliedDoc>(projectId, KIND_APPLIED, key)
    if (doc === undefined || doc.total === 0) return { total: 0, thisWeek: 0 }
    const since = new Date(Date.parse(this.now()) - WEEK_MS).toISOString()
    return {
      total: doc.total,
      thisWeek: doc.recent.filter(at => at > since).length,
      ...(doc.lastAt === undefined ? {} : { lastAt: doc.lastAt }),
      ...(doc.lastWhat === undefined ? {} : { lastWhat: doc.lastWhat }),
    }
  }

  /**
   * @param projectId - Tenant.
   * @param key - The rule id, or `quiet:<windowId>`.
   */
  forget(projectId: string, key: string): void {
    this.screens.delete(projectId, KIND_APPLIED, key)
  }

  /**
   * A stored rule as the screen reads it: its kind, whether the host obeys it, how many times it applied.
   * @param projectId - Tenant.
   * @param row - The stored rule.
   */
  ruleView(projectId: string, row: TriageRuleView): TriageRuleView {
    return { ...row, enforced: row.kind !== undefined && isHouseRuleKind(row.kind), applied: this.appliedOf(projectId, row.id) }
  }

  /**
   * A stored quiet window as the screen reads it.
   * @param projectId - Tenant.
   * @param row - The stored window.
   */
  windowView(projectId: string, row: QuietWindowView): QuietWindowView {
    return { id: row.id, label: row.label, start: row.start, end: row.end, enforced: true, applied: this.appliedOf(projectId, `quiet:${row.id}`) }
  }
}

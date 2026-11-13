/**
 * Marco Dogfood (C3/C7): the readable TRAIL of the responsible's loop — one line per action (pulled, chased, escalated, moved, summarized, held, refused), each with its project, card, persona, origin `quadro` and the
 * reason in a sentence — and the counters the e2e and the soak read ("how many cycles, how many actions of each kind, how many refusals") from the SAME place. Idempotent: a line with a `key` is written once per project
 * (a hold that repeats every cycle is one line). The Forge's pause writes here too (one trail, one reader). The store is a port: the host binds it to the audit table; tests use the memory one.
 */

export type LeadKind = 'lead:pull' | 'lead:chase' | 'lead:escalate' | 'lead:move' | 'lead:summary' | 'lead:hold' | 'lead:refused'

/** One line of the trail. Plain on the wire (`origin` is always the one word `quadro`). */
export interface LeadTraceEntry {
  readonly at: string
  readonly kind: LeadKind
  readonly projectId: string
  readonly ticketId?: string
  readonly personaId?: string
  readonly origin: 'quadro'
  /** The reason, in a sentence ("Puxei «Orçamento» e entreguei ao Téo: menor carga."). */
  readonly detail: string
}

/** What the trail needs to remember. */
export interface TrailStore {
  append(entry: LeadTraceEntry, key: string | undefined): void
  /** Whether a line with this key was already written for the project. */
  has(projectId: string, key: string): boolean
  /** Newest first. */
  list(projectId: string, limit: number): LeadTraceEntry[]
  bump(projectId: string, counter: string): void
  counter(projectId: string, counter: string): number
}

/** Counters of a project's loop. */
export interface LeadStats {
  readonly cycles: number
  readonly actions: Readonly<Record<string, number>>
  readonly refusals: number
}

export class LeadTrail {
  private readonly store: TrailStore
  private readonly nowIso: () => string

  /** @param store - Where the lines live. @param nowIso - The host's single clock. */
  constructor(store: TrailStore, nowIso: () => string) {
    this.store = store
    this.nowIso = nowIso
  }

  /** One cycle of the loop ran for the project. */
  cycle(projectId: string): void {
    this.store.bump(projectId, 'cycles')
  }

  /**
   * Write one line (once, when it has a key).
   * @returns Whether it was written (false = it was already there).
   */
  record(entry: { readonly kind: LeadKind; readonly projectId: string; readonly ticketId?: string; readonly personaId?: string; readonly detail: string; readonly key?: string }): boolean {
    if (entry.key !== undefined && this.store.has(entry.projectId, entry.key)) return false
    const { key, ...line } = entry
    this.store.append({ ...line, at: this.nowIso(), origin: 'quadro' }, key)
    this.store.bump(entry.projectId, entry.kind)
    return true
  }

  /** @returns The project's lines, newest first (never another project's). */
  list(projectId: string, limit: number): LeadTraceEntry[] {
    return this.store.list(projectId, Math.max(1, Math.min(200, Math.floor(limit))))
  }

  /** @returns Cycles, actions by kind and refusals of ONE project. */
  stats(projectId: string): LeadStats {
    const kinds: readonly LeadKind[] = ['lead:pull', 'lead:chase', 'lead:escalate', 'lead:move', 'lead:summary', 'lead:hold', 'lead:refused']
    const actions: Record<string, number> = {}
    for (const kind of kinds) {
      const count = this.store.counter(projectId, kind)
      if (count > 0) actions[kind] = count
    }
    return { cycles: this.store.counter(projectId, 'cycles'), actions, refusals: this.store.counter(projectId, 'lead:refused') }
  }
}

/** In-memory store (tests and the e2e before the host binds the audit table). */
export class MemoryTrailStore implements TrailStore {
  private readonly lines = new Map<string, LeadTraceEntry[]>()
  private readonly keys = new Set<string>()
  private readonly counters = new Map<string, number>()

  append(entry: LeadTraceEntry, key: string | undefined): void {
    const lines = this.lines.get(entry.projectId) ?? []
    lines.push(entry)
    this.lines.set(entry.projectId, lines)
    if (key !== undefined) this.keys.add(`${entry.projectId}/${key}`)
  }

  has(projectId: string, key: string): boolean {
    return this.keys.has(`${projectId}/${key}`)
  }

  list(projectId: string, limit: number): LeadTraceEntry[] {
    return [...(this.lines.get(projectId) ?? [])].reverse().slice(0, limit)
  }

  bump(projectId: string, counter: string): void {
    this.counters.set(`${projectId}/${counter}`, this.counter(projectId, counter) + 1)
  }

  counter(projectId: string, counter: string): number {
    return this.counters.get(`${projectId}/${counter}`) ?? 0
  }
}

/** The part of the screens KV the durable trail uses. */
export interface TrailKv {
  get<T>(projectId: string, kind: string, id: string): T | undefined
  put(projectId: string, kind: string, id: string, value: unknown): void
}

/** Kind and id of the doc that holds a project's trail (one small ring, no migration). */
export const TRAIL_KIND = 'lead_trail'
const TRAIL_ID = 'ring'
/** The newest lines and dedupe keys one project keeps (day-scoped keys make older ones irrelevant). */
export const TRAIL_LINES_MAX = 200
export const TRAIL_KEYS_MAX = 500

interface TrailDoc { lines: LeadTraceEntry[]; keys: string[]; counters: Record<string, number> }

/**
 * The DURABLE trail (C3/C7, E10): one small ring per project in the screens KV, so a host that is closed in the middle of a cycle and reopened on the SAME file keeps its lines, its dedupe keys (a hold already written is not
 * written again) and its counters. Per project; capped; plain.
 */
export class KvTrailStore implements TrailStore {
  private readonly kv: TrailKv

  /** @param kv - The screens KV. */
  constructor(kv: TrailKv) {
    this.kv = kv
  }

  append(entry: LeadTraceEntry, key: string | undefined): void {
    const doc = this.doc(entry.projectId)
    this.kv.put(entry.projectId, TRAIL_KIND, TRAIL_ID, {
      ...doc,
      lines: [...doc.lines, entry].slice(-TRAIL_LINES_MAX),
      keys: key === undefined ? doc.keys : [...doc.keys, key].slice(-TRAIL_KEYS_MAX),
    })
  }

  has(projectId: string, key: string): boolean {
    return this.doc(projectId).keys.includes(key)
  }

  list(projectId: string, limit: number): LeadTraceEntry[] {
    return [...this.doc(projectId).lines].reverse().slice(0, limit)
  }

  bump(projectId: string, counter: string): void {
    const doc = this.doc(projectId)
    this.kv.put(projectId, TRAIL_KIND, TRAIL_ID, { ...doc, counters: { ...doc.counters, [counter]: (doc.counters[counter] ?? 0) + 1 } })
  }

  counter(projectId: string, counter: string): number {
    return this.doc(projectId).counters[counter] ?? 0
  }

  private doc(projectId: string): TrailDoc {
    const saved = this.kv.get<TrailDoc>(projectId, TRAIL_KIND, TRAIL_ID)
    return { lines: saved?.lines ?? [], keys: saved?.keys ?? [], counters: saved?.counters ?? {} }
  }
}

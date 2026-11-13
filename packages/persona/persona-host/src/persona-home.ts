/**
 * D-116 "Onde roda", the host's model. Every persona has ONE home: a doc in the screens KV (kind `persona_home`, id = personaId, under her project's key — no migration). A persona with NO doc lives on THIS computer, active
 * (everyone made before D-116 is the creator's): nothing to show, nothing to migrate. The home only changes by a COMPARE-AND-SET on `epoch` (equal or lower = `stale-epoch`), a persona is CLOSED (durably) before she is moved,
 * and a record of a higher epoch seen on the mesh closes her at once (fencing): she is never in two places. Her presence is the presence of her computer. Pure: the host hands in the KV and the runtime stop.
 */

/** Kind of the screen doc that holds a persona's home. */
export const HOME_KIND = 'persona_home'

/** What is saved. `record` is the signed `HomeRecord` of the transfer layer, kept as it came. */
export interface HomeDoc {
  readonly computerId: string
  readonly epoch: number
  readonly state: 'active' | 'moving'
  readonly movingTo?: string
  readonly record?: unknown
  readonly since: string
}

/** The part of the screens KV the book uses. */
export interface HomeStore {
  get(projectId: string, kind: string, id: string): HomeDoc | undefined
  put(projectId: string, kind: string, id: string, value: HomeDoc): void
}

/** A refusal with a stable code. */
export class HomeError extends Error {
  readonly code: 'stale-epoch' | 'unknown-persona' | 'placement-refused'
  /** For `placement-refused`: the stable code of the placement rule (D-117). */
  readonly detail?: string
  constructor(code: HomeError['code'], detail?: string) {
    super(code)
    this.code = code
    if (detail !== undefined) this.detail = detail
  }
}

/** Where a persona lives now. `explicit: false` = no doc: this computer (nothing to show). */
export interface HomeNow {
  readonly computerId: string
  readonly epoch: number
  readonly state: 'active' | 'moving'
  readonly movingTo?: string
  readonly isThis: boolean
  readonly explicit: boolean
}

export interface PersonaHomeDeps {
  readonly store: HomeStore
  /** Which computer is this one (the device identity of the host). */
  readonly thisComputerId: () => string
  /** The project of a persona (her doc lives under it); undefined = no such persona. */
  readonly projectOf: (personaId: string) => string | undefined
  /** Every persona of this host (for `placesOf`). */
  readonly personaIds: () => readonly string[]
  /**
   * Cancel her open turn and let her runner go; the host also stops every computer-use run of hers (the same function as "Parar", reason `persona-fechada`). Called AFTER the doc says `moving`;
   * `reason` is why she was closed (`moving` = a transfer, `fenced` = a higher epoch was seen).
   */
  readonly stopRuntime: (personaId: string, reason: 'moving' | 'fenced') => void
  /** Her home moved to ANOTHER computer (D-117: the host turns computer use off in the new home until its owner turns it on again). */
  readonly onHomeChanged?: (personaId: string, fromComputerId: string, toComputerId: string) => void
  /** D-117: may she live on THAT computer? Returns the stable refusal code (the placement rule of `persona-scope.ts`), or undefined. A forged home record or a transfer to a forbidden computer stops here. */
  readonly placement?: (personaId: string, computerId: string) => string | undefined
}

export class PersonaHomeBook {
  private readonly deps: PersonaHomeDeps

  /** @param deps - The KV, the persona map, this computer and the runtime stop. */
  constructor(deps: PersonaHomeDeps) {
    this.deps = deps
  }

  /** @returns Where the persona lives now (a persona with no doc is on this computer, active, epoch 0). */
  resolve(personaId: string): HomeNow {
    const doc = this.docOf(personaId)
    const here = this.deps.thisComputerId()
    if (doc === undefined) return { computerId: here, epoch: 0, state: 'active', isThis: true, explicit: false }
    return { computerId: doc.computerId, epoch: doc.epoch, state: doc.state, ...(doc.movingTo === undefined ? {} : { movingTo: doc.movingTo }), isThis: doc.computerId === here, explicit: true }
  }

  /** @returns Whether THIS host runs her: her home is this computer AND she is active. Anything else is "fora do ar" here (no turn, no queue, no composer). */
  runsHere(personaId: string): boolean {
    const home = this.resolve(personaId)
    return home.isThis && home.state === 'active'
  }

  /**
   * Give her a home. A compare-and-set: only a HIGHER epoch writes.
   * @param input - The computer, the new epoch and the signed record as it came.
   * @param now - The host's clock.
   */
  set(personaId: string, input: { readonly computerId: string; readonly epoch: number; readonly record?: unknown }, now: string): void {
    const project = this.projectOf(personaId)
    if (!(input.epoch > this.resolve(personaId).epoch)) throw new HomeError('stale-epoch')
    const refusal = this.deps.placement?.(personaId, input.computerId)
    if (refusal !== undefined) throw new HomeError('placement-refused', refusal)
    const before = this.resolve(personaId).computerId
    this.deps.store.put(project, HOME_KIND, personaId, { computerId: input.computerId, epoch: input.epoch, state: 'active', ...(input.record === undefined ? {} : { record: input.record }), since: now })
    if (before !== input.computerId) this.deps.onHomeChanged?.(personaId, before, input.computerId)
  }

  /**
   * Close her BEFORE she is moved: the doc says `moving` first (a host that falls right after comes back knowing), THEN her turn is cancelled and her runner goes. Idempotent.
   * @param reason - `moving` (a transfer) or `fenced` (a higher epoch was seen).
   * @param movingTo - The destination computer, when known.
   */
  close(personaId: string, reason: 'moving' | 'fenced', movingTo?: string): void {
    const project = this.projectOf(personaId)
    const current = this.docOf(personaId)
    if (current?.state === 'moving') return
    const home = this.resolve(personaId)
    this.deps.store.put(project, HOME_KIND, personaId, {
      computerId: home.computerId, epoch: home.epoch, state: 'moving', ...(movingTo === undefined ? {} : { movingTo }), ...(current?.record === undefined ? {} : { record: current.record }), since: reason,
    })
    this.deps.stopRuntime(personaId, reason)
  }

  /** Reopen a persona that was `moving` (the transfer failed and she stays where she was). A persona that is not moving is left alone. */
  open(personaId: string): void {
    const project = this.projectOf(personaId)
    const current = this.docOf(personaId)
    if (current?.state !== 'moving') return
    this.deps.store.put(project, HOME_KIND, personaId, { computerId: current.computerId, epoch: current.epoch, state: 'active', ...(current.record === undefined ? {} : { record: current.record }), since: 'open' })
  }

  /**
   * The mesh showed a record of ANOTHER epoch for her. A higher one wins at once: if this host runs her she is closed first (fencing), then her home follows the record.
   * @returns Whether anything changed (an equal or older record is ignored).
   */
  onHigherEpochSeen(personaId: string, epoch: number, seen: { readonly computerId: string; readonly record?: unknown }, now: string): boolean {
    if (!(epoch > this.resolve(personaId).epoch)) return false
    if (this.deps.placement?.(personaId, seen.computerId) !== undefined) return false // a record the placement rule refuses must never stop a persona that is running (it is ignored)
    if (this.runsHere(personaId)) this.close(personaId, 'fenced', seen.computerId)
    this.set(personaId, { computerId: seen.computerId, epoch, ...(seen.record === undefined ? {} : { record: seen.record }) }, now)
    return true
  }

  /** @returns The personas whose home is that computer (the ones with no doc count for THIS computer). */
  placesOf(computerId: string): string[] {
    return this.deps.personaIds().filter(id => this.resolve(id).computerId === computerId)
  }

  private projectOf(personaId: string): string {
    const project = this.deps.projectOf(personaId)
    if (project === undefined) throw new HomeError('unknown-persona')
    return project
  }

  private docOf(personaId: string): HomeDoc | undefined {
    const project = this.deps.projectOf(personaId)
    return project === undefined ? undefined : this.deps.store.get(project, HOME_KIND, personaId)
  }
}

export type HomeStatus = 'ativa' | 'fora-do-ar' | 'em-transferencia'
export type HomeReason = 'computador-desligado' | 'em-transferencia' | 'pausada' | 'sem-ficha' | 'sem-motor'

/** What the host knows about the persona on THIS computer, and whether another computer is on. */
export interface PresenceContext {
  readonly paused: boolean
  readonly engineOk: boolean
  readonly sheetOk: boolean
  /** Whether a computer is on; `undefined` = unknown, which is treated as OFF (never "probably on"). */
  readonly online: (computerId: string) => boolean | undefined
}

/**
 * The presence of a persona IS the presence of her computer. The reason code is the closed vocabulary the screens and the phone read.
 * @param home - Where she lives.
 * @param context - What the host knows.
 */
export function presenceOf(home: HomeNow, context: PresenceContext): { readonly status: HomeStatus; readonly reasonCode?: HomeReason } {
  if (home.state === 'moving') return { status: 'em-transferencia', reasonCode: 'em-transferencia' }
  if (home.isThis) {
    if (context.paused) return { status: 'fora-do-ar', reasonCode: 'pausada' }
    if (!context.sheetOk) return { status: 'fora-do-ar', reasonCode: 'sem-ficha' }
    if (!context.engineOk) return { status: 'fora-do-ar', reasonCode: 'sem-motor' }
    return { status: 'ativa' }
  }
  return context.online(home.computerId) === true ? { status: 'ativa' } : { status: 'fora-do-ar', reasonCode: 'computador-desligado' }
}

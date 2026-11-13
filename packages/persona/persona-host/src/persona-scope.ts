/**
 * D-117 (host side): the STORAGE of who a persona is for (`audience`: private = only her creator, team = the whole team) and whether she may use the computer (`computerUse`, the creator's offer in her signed sheet),
 * plus the LOCAL grant of the computer's owner. The MATRIX that decides what is allowed is NOT here: it is `persona-engine/src/computer-scope.ts` (Zinc, the single implementation); the host binds its
 * `validatePersonaComputerConfig` as the `validate` dependency below and builds `computerAccessOf` on top of `decideComputerUse`. `persona_scope` has ONE writer (`PersonaScopeBook.set`), which asks that validator
 * against her CURRENT home, so no path edits it around the rule; the local grant is keyed by (computer, persona), given only on the computer itself, born OFF after a move and revoked when the audience changes.
 */

export type Audience = 'private' | 'team'
export type ComputerKind = 'personal' | 'team'

/** The shape of the engine's `validatePersonaComputerConfig` (the host binds the real one; tests bind a stub of the same shape — never a copy of the matrix). */
export type PlacementValidator = (input: {
  readonly persona: { readonly id: string; readonly audience: Audience; readonly creatorId: string; readonly computerUse: boolean; readonly homeComputerId: string }
  readonly home: { readonly computerId: string; readonly kind: ComputerKind | undefined; readonly ownerId: string; readonly teamComputerUse: boolean }
}) => { readonly ok: true } | { readonly ok: false; readonly reason: string }

/** What is saved (the mirror of the signed sheet's two fields). */
export interface ScopeDoc {
  readonly audience: Audience
  readonly computerUse: 'on' | 'off'
  readonly setBy: string
  readonly at: string
}

export interface ScopeStore {
  get(projectId: string, kind: string, id: string): ScopeDoc | undefined
  put(projectId: string, kind: string, id: string, value: ScopeDoc): void
}

/** The home computer of a persona as the host knows it (the computer's OWN facts). */
export interface HomeFacts {
  readonly computerId: string
  readonly kind: ComputerKind | undefined
  readonly ownerId?: string
  /** `caps.computerUse` of the team computer's certificate. */
  readonly teamComputerUse?: boolean
}

export class ScopeError extends Error {
  /** The reason code of the engine's matrix (`ComputerScopeReason`), or `unknown-persona`. */
  readonly reason: string
  constructor(reason: string) {
    super(reason)
    this.reason = reason
  }
}

export const SCOPE_KIND = 'persona_scope'
/** A persona with no doc is private with computer use off: the safe default. */
export const DEFAULT_SCOPE = { audience: 'private', computerUse: 'off' } as const

export interface ScopeBookDeps {
  readonly store: ScopeStore
  readonly validate: PlacementValidator
  readonly projectOf: (personaId: string) => string | undefined
  readonly creatorOf: (personaId: string) => string | undefined
  readonly homeOf: (personaId: string) => HomeFacts | undefined
  /** The audience changed or computer use went off: the host revokes the local grant of her home computer. */
  readonly onRevoke?: (personaId: string, computerId: string) => void
}

/** The ONLY writer of `persona_scope`: every change asks the engine's validator against her CURRENT home. */
export class PersonaScopeBook {
  private readonly deps: ScopeBookDeps

  /** @param deps - The KV, the engine's validator, the persona/creator maps and her home computer's facts. */
  constructor(deps: ScopeBookDeps) {
    this.deps = deps
  }

  /** @returns Her audience and computer-use switch (the safe default when never set). */
  get(personaId: string): { readonly audience: Audience; readonly computerUse: 'on' | 'off' } {
    const project = this.deps.projectOf(personaId)
    const doc = project === undefined ? undefined : this.deps.store.get(project, SCOPE_KIND, personaId)
    return doc === undefined ? DEFAULT_SCOPE : { audience: doc.audience, computerUse: doc.computerUse }
  }

  /**
   * Change who she is for / whether she may use the computer. Refused (nothing written) when the engine's validator refuses the combination with her current home.
   * @param next - The new audience and switch.
   * @param by - Who changed it.
   * @param at - The host's clock.
   */
  set(personaId: string, next: { readonly audience: Audience; readonly computerUse: 'on' | 'off' }, by: string, at: string): void {
    const project = this.deps.projectOf(personaId)
    const creatorId = this.deps.creatorOf(personaId)
    if (project === undefined || creatorId === undefined) throw new ScopeError('unknown-persona')
    const home = this.deps.homeOf(personaId)
    const verdict = this.deps.validate({ persona: { id: personaId, audience: next.audience, creatorId, computerUse: next.computerUse === 'on', homeComputerId: home?.computerId ?? '' }, home: homeOf(home) })
    if (!verdict.ok) throw new ScopeError(verdict.reason)
    const existing = this.deps.store.get(project, SCOPE_KIND, personaId)
    this.deps.store.put(project, SCOPE_KIND, personaId, { ...next, setBy: by, at })
    // The first write has nothing to revoke; afterwards a change of audience, or computer use going off, takes the local grant back.
    if (existing !== undefined && home !== undefined && (existing.audience !== next.audience || (existing.computerUse === 'on' && next.computerUse === 'off'))) this.deps.onRevoke?.(personaId, home.computerId)
  }

  /** @returns The reason code when a HOME at this computer is NOT allowed for her now (a forged home record, a transfer), or undefined. Same validator as `set`. */
  homeAllowed(personaId: string, home: HomeFacts): string | undefined {
    const creatorId = this.deps.creatorOf(personaId)
    if (creatorId === undefined) return 'unknown-persona'
    const scope = this.get(personaId)
    const verdict = this.deps.validate({ persona: { id: personaId, audience: scope.audience, creatorId, computerUse: scope.computerUse === 'on', homeComputerId: home.computerId }, home: homeOf(home) })
    return verdict.ok ? undefined : verdict.reason
  }
}

function homeOf(home: HomeFacts | undefined): { readonly computerId: string; readonly kind: ComputerKind | undefined; readonly ownerId: string; readonly teamComputerUse: boolean } {
  return { computerId: home?.computerId ?? '', kind: home?.kind, ownerId: home?.ownerId ?? '', teamComputerUse: home?.teamComputerUse === true }
}

/** What is saved: the LOCAL grant of the computer's owner (never travels with the sheet or the package). */
export interface GrantDoc {
  readonly on: boolean
  readonly by: string
  readonly at: string
}

export interface GrantStore {
  get(projectId: string, kind: string, id: string): GrantDoc | undefined
  put(projectId: string, kind: string, id: string, value: GrantDoc): void
}

export const GRANT_KIND = 'persona_computer_grant'

/**
 * The local concession "this persona may use THIS computer", keyed by (computerId, personaId). It is given ON the computer by its owner (or by who enrolled it, on a team PC) and only from the PC (the Remote that calls
 * `grant` is `pc-only`, never the phone); it is born OFF after a move, and revoked when the audience changes or the computer is unenrolled.
 */
export class ComputerGrantBook {
  private readonly store: GrantStore
  private readonly projectOf: (personaId: string) => string | undefined

  /** @param store - The KV. @param projectOf - The project of a persona (the key). */
  constructor(store: GrantStore, projectOf: (personaId: string) => string | undefined) {
    this.store = store
    this.projectOf = projectOf
  }

  grant(computerId: string, personaId: string, by: string, at: string): void {
    this.write(computerId, personaId, { on: true, by, at })
  }

  revoke(computerId: string, personaId: string, by: string, at: string): void {
    this.write(computerId, personaId, { on: false, by, at })
  }

  /** @returns Whether THIS computer's owner gave THIS persona the concession (a grant at another computer is nothing here). */
  has(computerId: string, personaId: string): boolean {
    const project = this.projectOf(personaId)
    return project !== undefined && this.store.get(project, GRANT_KIND, `${computerId}:${personaId}`)?.on === true
  }

  private write(computerId: string, personaId: string, doc: GrantDoc): void {
    const project = this.projectOf(personaId)
    if (project !== undefined) this.store.put(project, GRANT_KIND, `${computerId}:${personaId}`, doc)
  }
}

export const COMPUTER_USERS_KIND = 'persona_computer_users'

export interface UsersDoc {
  readonly memberIds: readonly string[]
  readonly by: string
  readonly at: string
}

export interface UsersStore {
  get(projectId: string, kind: string, id: string): UsersDoc | undefined
  put(projectId: string, kind: string, id: string, value: UsersDoc): void
}

/**
 * "Quem pode usar": who, besides the owner of a TEAM computer, may command a persona of the team on it, keyed by (computer, persona) so a move starts from an empty list (the owner of the new computer decides again).
 * Written only in-process (no Remote yet); read at every `computerAccessOf` call.
 */
export class ComputerUsersBook {
  private readonly store: UsersStore
  private readonly projectOf: (personaId: string) => string | undefined

  /** @param store - The KV. @param projectOf - The project of a persona (the key). */
  constructor(store: UsersStore, projectOf: (personaId: string) => string | undefined) {
    this.store = store
    this.projectOf = projectOf
  }

  /** @returns The members the owner listed for her on that computer (none when nothing was written). */
  of(computerId: string, personaId: string): readonly string[] {
    const project = this.projectOf(personaId)
    const doc = project === undefined ? undefined : this.store.get(project, COMPUTER_USERS_KIND, `${computerId}:${personaId}`)
    return Array.isArray(doc?.memberIds) ? doc.memberIds.filter((id): id is string => typeof id === 'string' && id !== '') : []
  }

  set(computerId: string, personaId: string, memberIds: readonly string[], by: string, at: string): void {
    const project = this.projectOf(personaId)
    if (project !== undefined) this.store.put(project, COMPUTER_USERS_KIND, `${computerId}:${personaId}`, { memberIds: [...new Set(memberIds)], by, at })
  }
}

export const HOST_GRANT_KIND = 'persona_host_grant'

/**
 * D-116 (L2): the creator's concession "this persona may run on THAT team computer", keyed by (computer, persona). It is READ by the computers' rule (`hostGrantOf`) and WRITTEN only in-process (no Remote): a grant
 * nobody signed (`by` empty) is no grant, and no data is "not granted" (fail closed). The creator takes it back with `revoke`; the host also drops it when she leaves that computer.
 */
export class HostGrantBook {
  private readonly store: GrantStore
  private readonly projectOf: (personaId: string) => string | undefined

  /** @param store - The KV. @param projectOf - The project of a persona (the key). */
  constructor(store: GrantStore, projectOf: (personaId: string) => string | undefined) {
    this.store = store
    this.projectOf = projectOf
  }

  grant(computerId: string, personaId: string, by: string, at: string): void {
    this.write(computerId, personaId, { on: true, by, at })
  }

  revoke(computerId: string, personaId: string, by: string, at: string): void {
    this.write(computerId, personaId, { on: false, by, at })
  }

  /** @returns Whether and by whom she was granted a home at that computer; anything unreadable, unsigned or missing is `{ granted: false, by: '' }`. */
  of(personaId: string, computerId: string): { readonly granted: boolean; readonly by: string } {
    const project = this.projectOf(personaId)
    const doc = project === undefined ? undefined : this.store.get(project, HOST_GRANT_KIND, `${computerId}:${personaId}`)
    return doc?.on === true && typeof doc.by === 'string' && doc.by !== '' ? { granted: true, by: doc.by } : { granted: false, by: '' }
  }

  private write(computerId: string, personaId: string, doc: GrantDoc): void {
    const project = this.projectOf(personaId)
    if (project !== undefined) this.store.put(project, HOST_GRANT_KIND, `${computerId}:${personaId}`, doc)
  }
}

/**
 * The `computerUse` boolean the host hands the engine's matrix (`ComputerUsePersona.computerUse`): the creator's offer AND the local grant of the computer's owner. Whether she may actually move the mouse is
 * `decideComputerUse` (the engine's single implementation, at every step) — never decided here.
 */
export function effectiveComputerUse(offered: 'on' | 'off', granted: boolean): boolean {
  return offered === 'on' && granted
}

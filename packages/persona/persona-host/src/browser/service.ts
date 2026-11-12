/**
 * Item 17 (colheita): the host side of the personas' browser. One Chrome per profile, the turn decides who drives, and the
 * person's "Assumir controle" is the same turn taken from a persona. The person's own Chrome profile is never opened.
 *
 * The launcher is injected so the rules (grants, turn, one Chrome per profile) are testable without a browser; the host
 * passes {@link launchChrome}.
 */

import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, type ChromeInstall } from './chrome.ts'
import { launchChrome, type ChromeSession } from './launch.ts'
import {
  profileByName,
  profileFolder,
  profileGranted,
  profileNameTaken,
  type BrowserProfile,
  type ProfileGrants,
} from './profiles.ts'
import { holdsTurn, takeTurn, turnHolder, TURN_IDLE_MS, type TakeOutcome, type Turn, type TurnHolder } from './turn.ts'

/** A live Chrome of one profile. */
export interface ProfileSession {
  readonly port: number
  readonly version: string | undefined
}

/** Why a turn could not have the browser. */
export type BrowserDenial = 'sem-perfil' | 'sem-vez' | 'sem-chrome'

/** A browser refusal with a sentence for the screen; the turn keeps working without the browser. */
export class BrowserDeniedError extends Error {
  readonly why: BrowserDenial

  /** @param why - Which refusal. @param message - The sentence the screen shows. */
  constructor(why: BrowserDenial, message: string) {
    super(message)
    this.name = 'BrowserDeniedError'
    this.why = why
  }
}

/** What the host needs from the machine. */
export interface BrowserServiceDeps {
  /** The product's data directory (profiles live under it). */
  readonly dataRoot: string
  /** Chrome discovery; default {@link findChrome}. */
  readonly chrome?: () => ChromeInstall | undefined
  /** Launcher; default {@link launchChrome}. */
  readonly launch?: (input: { chrome: ChromeInstall; profileDir: string; headless: boolean }) => Promise<ChromeSession>
  /** Clock; default `Date.now`. */
  readonly now?: () => number
  /** Called after a profile or a grant changes (the host persists the list). */
  readonly onChange?: () => void
  /**
   * Called when a person takes a live persona's turn: the host stops that persona's run, so no command is sent after the
   * person has the window.
   */
  readonly onTakeover?: (previous: TurnHolder) => void
}

/** What the screen shows for one profile. */
export interface ProfileState {
  readonly profile: BrowserProfile
  readonly holder: TurnHolder | undefined
  readonly running: boolean
  readonly port: number | undefined
}

/**
 * Profiles, grants and Chrome sessions of this computer. In memory: the host persists the list and the grants in the
 * product's store and feeds them back on boot.
 */
export class BrowserService {
  private readonly deps: BrowserServiceDeps
  private list: BrowserProfile[] = []
  private grants: ProfileGrants = {}
  private turns = new Map<string, Turn>()
  /** The turn that opened each live Chrome: an open session pins the turn, so a lapse never hands the page to another. */
  private openers = new Map<string, Turn>()
  private sessions = new Map<string, ChromeSession>()

  /** @param deps - Data folder, Chrome discovery, launcher, clock. */
  constructor(deps: BrowserServiceDeps) {
    this.deps = deps
  }

  /** Adopt the stored profiles and grants (boot). */
  restore(profiles: readonly BrowserProfile[], grants: ProfileGrants): void {
    this.list = [...profiles]
    this.grants = grants
  }

  /** Every profile, in creation order. */
  profiles(): readonly BrowserProfile[] {
    return this.list
  }

  /**
   * Create a profile.
   * @param name - The name the person typed.
   * @returns The new profile.
   * @throws Error when the name is empty or already used.
   */
  create(name: string): BrowserProfile {
    if (name.trim() === '') throw new Error('o perfil precisa de um nome')
    if (profileNameTaken(this.list, name)) throw new Error(`já existe um perfil chamado "${name.trim()}"`)
    const profile: BrowserProfile = { id: `p-${randomUUID().slice(0, 8)}`, name: name.trim() }
    this.list = [...this.list, profile]
    this.changed()
    return profile
  }

  /**
   * Rename a profile.
   * @param id - Profile id.
   * @param name - The new name.
   * @throws Error when the profile does not exist or the name is used by another.
   */
  rename(id: string, name: string): void {
    const current = this.list.find(profile => profile.id === id)
    if (current === undefined) throw new Error('perfil não encontrado')
    if (name.trim() === '') throw new Error('o perfil precisa de um nome')
    if (profileNameTaken(this.list, name, id)) throw new Error(`já existe um perfil chamado "${name.trim()}"`)
    this.list = this.list.map(profile => profile.id === id ? { ...profile, name: name.trim() } : profile)
    this.changed()
  }

  /** Grant a profile to a persona. */
  grant(personaId: string, profileId: string): void {
    const current = this.grants[personaId] ?? []
    if (current.includes(profileId)) return
    this.grants = { ...this.grants, [personaId]: [...current, profileId] }
    this.changed()
  }

  /** Take a profile back from a persona. */
  revoke(personaId: string, profileId: string): void {
    const current = this.grants[personaId] ?? []
    this.grants = { ...this.grants, [personaId]: current.filter(id => id !== profileId) }
    this.changed()
  }

  /** The grants table (for the screen and for persistence). */
  grantsOf(): ProfileGrants {
    return this.grants
  }

  /** Whether a persona may drive a profile. */
  granted(personaId: string, profileId: string): boolean {
    return profileGranted(this.grants, personaId, profileId)
  }

  /**
   * Take or renew the turn of a profile. While a Chrome of the profile is open, its opener keeps the turn regardless of
   * idle time; a person taking it from a persona stops that persona's run (see {@link BrowserServiceDeps.onTakeover}).
   * @param profileId - Profile id.
   * @param holder - Persona or person.
   */
  takeTurn(profileId: string, holder: TurnHolder): TakeOutcome {
    const granted = holder.kind === 'person' || this.granted(holder.id, profileId)
    const stored = this.liveTurn(profileId)
    const previous = turnHolder(stored, this.now())
    const outcome = takeTurn(stored, { holder, granted }, this.now())
    if (!outcome.ok) return outcome
    this.turns.set(profileId, outcome.turn)
    if (previous !== undefined && holder.kind === 'person' && previous.kind === 'persona') {
      this.openers.delete(profileId)
      this.deps.onTakeover?.(previous)
    }
    return outcome
  }

  /** End the turn early ("Devolver"). */
  releaseTurn(profileId: string, holder: TurnHolder): void {
    if (!holdsTurn(this.liveTurn(profileId), holder, this.now())) return
    this.turns.delete(profileId)
    this.openers.delete(profileId)
  }

  /** Who drives a profile right now. */
  holderOf(profileId: string): TurnHolder | undefined {
    return turnHolder(this.liveTurn(profileId), this.now())
  }

  /** The turn as it stands: a live Chrome pins its opener past the idle lapse. */
  private liveTurn(profileId: string): Turn | undefined {
    const pinned = this.openers.get(profileId)
    if (pinned === undefined) return this.turns.get(profileId)
    return { holder: pinned.holder, since: pinned.since, until: this.now() + TURN_IDLE_MS }
  }

  /**
   * Start (or reuse) the profile's Chrome. The caller must hold the turn: a persona that lost it gets the browser of
   * nobody, so an approved action never lands in another conversation.
   * @param profileId - Profile id.
   * @param holder - Who asks.
   * @returns The DevTools port and version.
   * @throws Error when the profile is unknown, Chrome is missing, or the caller does not hold the turn.
   */
  async open(profileId: string, holder: TurnHolder): Promise<ProfileSession> {
    const profile = this.list.find(item => item.id === profileId)
    if (profile === undefined) throw new BrowserDeniedError('sem-perfil', 'perfil não encontrado')
    const live = this.holderOf(profileId)
    if (live === undefined || live.kind !== holder.kind || live.id !== holder.id) {
      throw new BrowserDeniedError('sem-vez', 'outra pessoa ou persona está usando este perfil agora')
    }
    const current = this.sessions.get(profileId)
    if (current !== undefined) return { port: current.port, version: current.version }
    const chrome = (this.deps.chrome ?? findChrome)()
    if (chrome === undefined) throw new BrowserDeniedError('sem-chrome', 'o Google Chrome não está instalado neste computador')
    const dir = profileFolder(this.deps.dataRoot, profileId)
    mkdirSync(dir, { recursive: true })
    const launch = this.deps.launch ?? launchChrome
    // Headed: the window IS the shared surface. The person watches the persona work and takes the turn in the same
    // window ("Assumir controle"); a headless Chrome could not be taken over without losing the page.
    const session = await launch({ chrome, profileDir: dir, headless: false })
    const turn = this.turns.get(profileId)
    if (turn !== undefined) this.openers.set(profileId, turn)
    this.sessions.set(profileId, session)
    return { port: session.port, version: session.version }
  }

  /**
   * The profile a persona is driving right now, with its DevTools port. No side effect: a persona without an open browser
   * gets nothing (never a new Chrome).
   * @param personaId - The persona.
   */
  liveSessionOf(personaId: string): { readonly profile: BrowserProfile; readonly port: number } | undefined {
    for (const profile of this.list) {
      const session = this.sessions.get(profile.id)
      if (session === undefined) continue
      const holder = this.holderOf(profile.id)
      if (holder?.kind === 'persona' && holder.id === personaId) return { profile, port: session.port }
    }
    return undefined
  }

  /**
   * The empty folder the profile's browser may read. The DevTools server's filesystem tools can only take files from
   * here, so `upload_file` has nothing of the person's disk to send.
   * @param profileId - Profile id.
   * @returns The folder, created when missing.
   */
  uploadFolder(profileId: string): string {
    const dir = join(this.deps.dataRoot, 'browser-uploads', profileId)
    mkdirSync(dir, { recursive: true })
    return dir
  }

  /**
   * The profile a persona drives when it does not name one: the earliest created among those granted. The screen shows
   * it on the persona, so a second profile is never silently used.
   * @param personaId - The persona.
   */
  defaultProfileOf(personaId: string): BrowserProfile | undefined {
    return this.list.find(profile => this.granted(personaId, profile.id))
  }

  /**
   * The browser of one persona's turn: resolve the profile (by name, or the default it was granted), take or renew
   * the turn and start Chrome. This is what a turn calls before it is handed the browser tools.
   * @param personaId - The persona that will drive.
   * @param profileName - The profile it asked for; empty means "the one I was granted" (the first, when several).
   * @returns The profile and its DevTools port.
   * @throws Error with a sentence for the screen when there is no profile, no grant, or someone else is driving.
   */
  async sessionFor(personaId: string, profileName: string = ''): Promise<{ profile: BrowserProfile; session: ProfileSession }> {
    const granted = this.list.filter(profile => this.granted(personaId, profile.id))
    const profile = profileName.trim() === ''
      ? granted[0]
      : profileByName(granted, profileName)
    if (profile === undefined) {
      throw new BrowserDeniedError('sem-perfil', granted.length === 0
        ? 'esta persona não tem nenhum perfil de navegador liberado'
        : `esta persona não tem o perfil "${profileName.trim()}" liberado`)
    }
    const turn = this.takeTurn(profile.id, { kind: 'persona', id: personaId })
    if (!turn.ok) {
      throw new BrowserDeniedError('sem-vez', turn.reason === 'busy'
        ? 'outra pessoa ou persona está usando este perfil agora'
        : 'esta persona não tem este perfil liberado')
    }
    return { profile, session: await this.open(profile.id, { kind: 'persona', id: personaId }) }
  }

  /** Stop the profile's Chrome (the turn is untouched). */
  async close(profileId: string): Promise<void> {
    const session = this.sessions.get(profileId)
    if (session === undefined) return
    this.sessions.delete(profileId)
    this.openers.delete(profileId)
    await session.close()
  }

  /** What the screen shows. */
  state(profileId: string): ProfileState | undefined {
    const profile = this.list.find(item => item.id === profileId)
    if (profile === undefined) return undefined
    const session = this.sessions.get(profileId)
    return { profile, holder: this.holderOf(profileId), running: session !== undefined, port: session?.port }
  }

  /** Stop every Chrome (host shutdown). */
  async closeAll(): Promise<void> {
    const sessions = [...this.sessions.values()]
    this.sessions.clear()
    this.openers.clear()
    await Promise.all(sessions.map(session => session.close()))
  }

  private now(): number {
    return (this.deps.now ?? Date.now)()
  }

  private changed(): void {
    this.deps.onChange?.()
  }
}

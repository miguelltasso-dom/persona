/**
 * H23 / F4, law 3, the host's half: in a team that is connected to a hub, a persona only ACTS on a sheet that carries her owner's signature (`persona-sync/persona-sheet.ts`).
 *
 * Who signs: this host, with its own device key, whenever the person who runs it creates or changes a persona here (every local write goes through the product repos, which
 * this class wraps once) and, when the team is connected, for every persona the project already has. What it refuses: a persona whose stored sheet no longer matches what was
 * signed — a row written by anything that is not this host's own code (a replicated edit from a colleague, a hand-edited database) — or whose signature is not this device's.
 * The refusal is loud and in her own words, and the owner can read the row, decide, and sign it again (`review`). A project that is NOT a connected team (a solo desk) is never
 * touched: nothing to defend there, and nothing changes for it.
 */
import { checkSheet, signSheet, type Identity, type SheetFields, type SheetVerdict, type SignedSheet } from '@deepseek-ai/dsh-persona-sync'
import type { ScreenRepos, StoredPersona } from '@deepseek-ai/dsh-persona-store'

const KIND = 'persona_sheet'

/** What the guard needs to know about a project's team. */
export interface SheetTeam {
  /** The owner's member id at the hub (the one this device signs as). */
  readonly actorId: string
}

/** Dependencies, replaceable in tests. */
export interface PersonaSheetsDeps {
  readonly screens: ScreenRepos
  /** This device's identity (the Cofre's sealed slot). */
  identity: () => Promise<Identity>
  /** The team this host OWNS for that project, or `undefined` (solo, a guest, not connected): then nothing is enforced. */
  team: (workspaceId: string, projectId: string) => SheetTeam | undefined
}

/** The persona was refused because her sheet does not match the owner's signature. Its message is the sentence the person reads. */
export class SheetRefusedError extends Error {
  readonly code = 'sheet_refused' as const
  readonly verdict: Exclude<SheetVerdict, 'ok'>

  /** @param personaName - Her name. @param verdict - Why. */
  constructor(personaName: string, verdict: Exclude<SheetVerdict, 'ok'>) {
    super(verdict === 'unsigned'
      ? `${personaName} ainda não tem a assinatura do dono na ficha. Ela não age até o dono revisar e assinar.`
      : `A ficha de ${personaName} não confere com a assinatura do dono (alguém mudou o que ela pode fazer). Ela não age até o dono revisar e assinar de novo.`)
    this.name = 'SheetRefusedError'
    this.verdict = verdict
  }
}

/** @param error - Anything thrown. @returns Whether it is a sheet refusal. */
export function isSheetRefusedError(error: unknown): error is SheetRefusedError {
  return error instanceof SheetRefusedError
}

/**
 * @param persona - A persona as stored.
 * @returns What her sheet covers (never her name, avatar, title or description: those do not decide what she may do).
 */
export function sheetFieldsOf(persona: StoredPersona): SheetFields {
  return {
    personaId: persona.id, workspaceId: persona.workspaceId, instructions: persona.instructions, personality: persona.personality, runner: persona.runner,
    tools: persona.tools, skills: persona.skills, limits: persona.limits, systemRoles: persona.systemRoles, canRecruit: persona.canRecruit,
    ...(persona.reportsTo === undefined ? {} : { reportsTo: persona.reportsTo }), ...(persona.schedule === undefined ? {} : { schedule: persona.schedule }),
  }
}

/** The guard. One per host. */
export class PersonaSheets {
  readonly deps: PersonaSheetsDeps
  private readonly pending = new Set<Promise<void>>()
  private bypassing = 0

  /** @param deps - Screens, this device's identity and the team lookup. */
  constructor(deps: PersonaSheetsDeps) {
    this.deps = deps
  }

  /**
   * Run `write` WITHOUT signing what it writes: this is what a replicated edit, an import or a hand-edited row look like to the guard (they are not the owner's own act).
   * @param write - The writes.
   */
  bypass<T>(write: () => T): T {
    this.bypassing += 1
    try {
      return write()
    } finally {
      this.bypassing -= 1
    }
  }

  /**
   * The owner's own write: sign it in the background (the identity is the Cofre's, so it is asynchronous); a gate that runs next waits for it.
   * @param persona - The persona as stored after the write.
   */
  signLater(persona: StoredPersona): void {
    if (this.bypassing > 0 || this.deps.team(persona.workspaceId, persona.projectId) === undefined) return
    const job = this.sign(persona).catch((error: unknown) => { void error }).finally(() => { this.pending.delete(job) }) // no identity: she stays unsigned and the gate says so
    this.pending.add(job)
  }

  /**
   * Sign this persona's sheet as the owner of the project's team (the owner "reviewed" it: also what `review` does).
   * @param persona - The persona as stored now.
   * @throws Error when this host is not the owner of a connected team for her project.
   */
  async sign(persona: StoredPersona): Promise<void> {
    const team = this.deps.team(persona.workspaceId, persona.projectId)
    if (team === undefined) throw new Error('persona-sheet-no-team')
    const identity = await this.deps.identity()
    const signed = signSheet(sheetFieldsOf(persona), { ownerId: team.actorId, signingSeed: identity.signing.seed })
    this.deps.screens.put(persona.projectId, KIND, persona.id, signed)
  }

  /**
   * The team was just connected (or the owner reviewed a whole project): sign every persona the project has, as it is now.
   * @param personas - The project's personas.
   */
  async signAll(personas: readonly StoredPersona[]): Promise<void> {
    for (const persona of personas) await this.sign(persona)
  }

  /**
   * @param persona - A persona as stored now.
   * @returns `solo` when nothing is enforced for her project, else whether her sheet is the one the owner signed.
   */
  async verdict(persona: StoredPersona): Promise<SheetVerdict | 'solo'> {
    const team = this.deps.team(persona.workspaceId, persona.projectId)
    if (team === undefined) return 'solo'
    await Promise.all([...this.pending]) // the owner's own writes just made are signed before anybody looks
    let signingPublic: string
    try {
      signingPublic = (await this.deps.identity()).signing.publicKey
    } catch (error) {
      void error // the device identity is not available: nothing can be verified, so nothing is trusted
      return 'foreign'
    }
    const stored = this.deps.screens.get<SignedSheet>(persona.projectId, KIND, persona.id)
    return checkSheet(sheetFieldsOf(persona), stored, { ownerId: team.actorId, signingPublic })
  }

  /**
   * The one place a persona is let through: the orchestration asks before it opens a runner for her.
   * @param persona - The persona about to act.
   * @throws SheetRefusedError unless the project is solo or her sheet is the owner's.
   */
  async gate(persona: StoredPersona): Promise<void> {
    const verdict = await this.verdict(persona)
    if (verdict !== 'solo' && verdict !== 'ok') throw new SheetRefusedError(persona.name, verdict)
  }
}

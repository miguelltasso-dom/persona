/**
 * Team governance records (BRIEFING 16 / D-054).
 * Sector names and persona names are data — never hardcoded in invariants.
 */

import { DomainError } from '../domain/schemas.ts'

/** Autonomy ceiling / default. Matches the engine levels. */
export type GovernanceAutonomy = 'on_request' | 'propose' | 'act'

/** Human presence at a clock instant. */
export type HumanPresence = 'available' | 'away' | 'absent'

/** One editable sector. Display `name` is user data. */
export interface Sector {
  id: string
  workspaceId: string
  name: string
  policy: SectorPolicy
}

/** Default autonomy, spend hint, and approval kinds this sector always needs. */
export interface SectorPolicy {
  autonomy: GovernanceAutonomy
  tokensPerDay?: number
  requiredApprovals: readonly string[]
}

/** Workspace person who can be a responsável or substituto. */
export interface HumanMember {
  id: string
  name: string
}

/** Roster row the organogram needs. System roles stay assignable (D-043). */
export interface GovernancePersona {
  id: string
  title: string
  systemRoles: readonly ('coordination' | 'watchdog' | 'librarian' | 'team_manager')[]
  live?: 'working' | 'idle' | 'needs_you' | 'away'
}

/** Who cares for one persona. `confirmed` is false until a human accepts an inherited charge. */
export interface PersonaCharge {
  personaId: string
  sectorId?: string
  responsibleHumanId: string
  substituteHumanId?: string
  confirmed: boolean
}

/** Owner of a recurring routine. Missing owner is a health alert, not a fatal error. */
export interface RoutineCharge {
  routineId: string
  title: string
  executorPersonaId?: string
  responsibleHumanId?: string
  sectorId?: string
  requiresApproval: boolean
  approvalKind?: string
  autonomy?: GovernanceAutonomy
  cadence?: 'daily' | 'weekly'
}

/** Closed interval `[from, until)` when a human is out. */
export interface AwayWindow {
  humanId: string
  kind: 'away' | 'absent'
  from: string
  until: string
}

/** Full in-memory picture the host persists (Anvil v9). */
export interface GovernanceSnapshot {
  workspaceId: string
  humans: readonly HumanMember[]
  personas: readonly GovernancePersona[]
  sectors: readonly Sector[]
  charges: readonly PersonaCharge[]
  away: readonly AwayWindow[]
  routines: readonly RoutineCharge[]
  queueByPersona?: Readonly<Record<string, number>>
  idleSince?: Readonly<Record<string, string>>
}

const AUTONOMY_RANK: Record<GovernanceAutonomy, number> = {
  on_request: 0,
  propose: 1,
  act: 2,
}

/**
 * Rank for comparing autonomy. Higher may act more freely.
 * @param level - Autonomy.
 */
export function autonomyRank(level: GovernanceAutonomy): number {
  return AUTONOMY_RANK[level]
}

/**
 * Whether `next` stays at or under the sector ceiling.
 * @param next - Requested level.
 * @param ceiling - Sector policy autonomy.
 */
export function autonomyWithinCeiling(next: GovernanceAutonomy, ceiling: GovernanceAutonomy): boolean {
  return autonomyRank(next) <= autonomyRank(ceiling)
}

/**
 * Default policy when the user creates a sector without extras.
 */
export function defaultSectorPolicy(): SectorPolicy {
  return { autonomy: 'propose', requiredApprovals: [] }
}

/**
 * Refuse an empty sector name or empty id.
 * @param sector - Candidate.
 */
export function assertSector(sector: Sector): void {
  if (sector.id === '' || sector.name.trim() === '') throw new DomainError('INVALID_GOVERNANCE', 'sector')
}

/**
 * Every persona charge needs a responsável; substituto cannot be the same person.
 * @param charge - Candidate mapping.
 */
export function assertPersonaCharge(charge: PersonaCharge): void {
  if (charge.personaId === '' || charge.responsibleHumanId === '') {
    throw new DomainError('INVALID_GOVERNANCE', 'missing_responsible')
  }
  if (charge.substituteHumanId !== undefined && charge.substituteHumanId === charge.responsibleHumanId) {
    throw new DomainError('INVALID_GOVERNANCE', 'substitute_is_responsible')
  }
}

/**
 * Build a charge. Default responsável is the creator.
 * @param input - Mapping fields.
 */
export function assignPersonaCharge(input: {
  personaId: string
  responsibleHumanId: string
  substituteHumanId?: string
  sectorId?: string
  confirmed?: boolean
}): PersonaCharge {
  const charge: PersonaCharge = {
    personaId: input.personaId,
    responsibleHumanId: input.responsibleHumanId,
    confirmed: input.confirmed ?? true,
    ...(input.substituteHumanId === undefined ? {} : { substituteHumanId: input.substituteHumanId }),
    ...(input.sectorId === undefined ? {} : { sectorId: input.sectorId }),
  }
  assertPersonaCharge(charge)
  return charge
}

/**
 * Persona proposed by an agent inherits the creator's responsável until a human confirms.
 * @param creator - Charge of the recruiting persona.
 * @param personaId - New persona.
 */
export function inheritPersonaCharge(creator: PersonaCharge, personaId: string): PersonaCharge {
  return assignPersonaCharge({
    personaId,
    responsibleHumanId: creator.responsibleHumanId,
    ...(creator.substituteHumanId === undefined ? {} : { substituteHumanId: creator.substituteHumanId }),
    ...(creator.sectorId === undefined ? {} : { sectorId: creator.sectorId }),
    confirmed: false,
  })
}

/**
 * Mark an inherited charge as accepted by a human.
 * @param charge - Inherited row.
 */
export function confirmPersonaCharge(charge: PersonaCharge): PersonaCharge {
  assertPersonaCharge(charge)
  return { ...charge, confirmed: true }
}

/**
 * Presence of one human at `at` (ISO). No window ⇒ available.
 * @param away - Windows.
 * @param humanId - Person.
 * @param at - Instant.
 */
export function humanPresence(
  away: readonly AwayWindow[],
  humanId: string,
  at: string,
): HumanPresence {
  const t = Date.parse(at)
  for (const window of away) {
    if (window.humanId !== humanId) continue
    if (t >= Date.parse(window.from) && t < Date.parse(window.until)) return window.kind
  }
  return 'available'
}

/**
 * Charge for a persona, if any.
 * @param snapshot - Workspace.
 * @param personaId - Persona.
 */
export function chargeOf(snapshot: GovernanceSnapshot, personaId: string): PersonaCharge | undefined {
  return snapshot.charges.find(row => row.personaId === personaId)
}

/**
 * Sector row, if any.
 * @param snapshot - Workspace.
 * @param sectorId - Sector.
 */
export function sectorOf(snapshot: GovernanceSnapshot, sectorId: string | undefined): Sector | undefined {
  if (sectorId === undefined) return undefined
  return snapshot.sectors.find(row => row.id === sectorId)
}

/**
 * Effective autonomy: routine override, else sector default, else propose.
 * @param snapshot - Workspace.
 * @param routine - Routine.
 */
export function routineAutonomy(snapshot: GovernanceSnapshot, routine: RoutineCharge): GovernanceAutonomy {
  if (routine.autonomy !== undefined) return routine.autonomy
  return sectorOf(snapshot, routine.sectorId)?.policy.autonomy ?? 'propose'
}

/**
 * Whether this approval kind is mandatory for the routine's sector.
 * @param snapshot - Workspace.
 * @param routine - Routine.
 */
export function sectorRequiresApproval(snapshot: GovernanceSnapshot, routine: RoutineCharge): boolean {
  if (routine.requiresApproval) return true
  const kind = routine.approvalKind
  if (kind === undefined) return false
  return sectorOf(snapshot, routine.sectorId)?.policy.requiredApprovals.includes(kind) === true
}

/**
 * Human display name, or the id when the roster row is missing.
 * @param snapshot - Workspace.
 * @param humanId - Person.
 */
export function humanName(snapshot: GovernanceSnapshot, humanId: string): string {
  return snapshot.humans.find(row => row.id === humanId)?.name ?? humanId
}

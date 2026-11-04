/**
 * Wire for `completeOnboarding`. Host `CompleteOnboardingRequest` is this object.
 * The live store must not send `roster` / `projectId` (Padaria DF-002).
 */

import { withDefaultGestor } from './rules.ts'
import { DomainError, type PersonaSpec, type SystemRole } from './schemas.ts'

/** One persona on the first-run wire (no hardcoded names). */
export interface OnboardingPersonaWire {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly personality: string
  readonly instructions: string
  readonly avatarKind: 'gallery' | 'upload' | 'silhouette'
  readonly avatarRef: string
  readonly runnerKind: 'dsh' | 'cli'
  readonly runnerCli: string
  readonly runnerModel: string
  readonly canRecruit: boolean
  readonly systemRoles: readonly SystemRole[]
}

/**
 * Idempotent first-run. Empty `cofreSeed` skips the vault proposal.
 * Keys match the host Remote; extra keys (`roster`, `projectId`) are refused.
 */
export interface CompleteOnboardingWire {
  readonly workspaceId: string
  readonly personalProjectId: string
  readonly displayName: string
  readonly team: readonly OnboardingPersonaWire[]
  readonly templateIds: readonly string[]
  readonly runnerChoices: readonly string[]
  readonly cofreSeed: string
}

/**
 * Map a domain spec onto the host onboarding row.
 * @param spec - Persona the overlay already validated.
 */
export function personaSpecToOnboardingWire(spec: PersonaSpec): OnboardingPersonaWire {
  return {
    name: spec.name,
    title: spec.title,
    description: spec.description,
    personality: spec.personality,
    instructions: spec.instructions,
    avatarKind: spec.avatar.kind,
    avatarRef: spec.avatar.ref,
    runnerKind: spec.runner.kind,
    runnerCli: spec.runner.kind === 'cli' ? spec.runner.cli : '',
    runnerModel: spec.runner.model,
    canRecruit: spec.canRecruit,
    systemRoles: withDefaultGestor(spec.systemRoles),
  }
}

export interface CompleteOnboardingInput {
  readonly workspaceId: string
  readonly personalProjectId: string
  readonly displayName: string
  readonly team?: readonly PersonaSpec[]
  readonly templateIds?: readonly string[]
  readonly runnerChoices?: readonly string[]
  readonly cofreSeed?: string
}

/**
 * Build the only accepted first-run payload.
 * @param input - Tenant, display name, optional overlay team.
 */
export function completeOnboardingWire(input: CompleteOnboardingInput): CompleteOnboardingWire {
  const displayName = input.displayName.trim()
  if (input.workspaceId.trim() === '' || input.personalProjectId.trim() === '') {
    throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE_SCOPE')
  }
  return {
    workspaceId: input.workspaceId,
    personalProjectId: input.personalProjectId,
    displayName,
    team: (input.team ?? []).map(personaSpecToOnboardingWire),
    templateIds: input.templateIds === undefined ? [] : [...input.templateIds],
    runnerChoices: input.runnerChoices === undefined || input.runnerChoices.length === 0
      ? ['dsh']
      : [...input.runnerChoices],
    cofreSeed: input.cofreSeed ?? '',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Refuse the live-store shape that remounts the overlay (DF-002).
 * @param value - Untrusted RPC body.
 */
export function parseCompleteOnboardingWire(value: unknown): CompleteOnboardingWire {
  if (!isRecord(value)) throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE')
  if ('roster' in value) throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE_ROSTER')
  if ('projectId' in value && !('personalProjectId' in value)) {
    throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE_PROJECT_ID')
  }
  const workspaceId = typeof value.workspaceId === 'string' ? value.workspaceId : ''
  const personalProjectId = typeof value.personalProjectId === 'string' ? value.personalProjectId : ''
  const displayName = typeof value.displayName === 'string' ? value.displayName : ''
  if (workspaceId === '' || personalProjectId === '') {
    throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE_SCOPE')
  }
  const team = Array.isArray(value.team) ? value.team : undefined
  if (team === undefined) throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE_TEAM')
  const templateIds = Array.isArray(value.templateIds)
    ? value.templateIds.filter((id): id is string => typeof id === 'string')
    : []
  const runnerChoices = Array.isArray(value.runnerChoices)
    ? value.runnerChoices.filter((id): id is string => typeof id === 'string')
    : ['dsh']
  const cofreSeed = typeof value.cofreSeed === 'string' ? value.cofreSeed : ''
  return {
    workspaceId,
    personalProjectId,
    displayName,
    team: team.map(parseOnboardingPersonaWire),
    templateIds,
    runnerChoices: runnerChoices.length === 0 ? ['dsh'] : runnerChoices,
    cofreSeed,
  }
}

function parseOnboardingPersonaWire(value: unknown): OnboardingPersonaWire {
  if (!isRecord(value)) throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE_PERSONA')
  const name = typeof value.name === 'string' ? value.name : ''
  const title = typeof value.title === 'string' ? value.title : ''
  if (name === '' || title === '') throw new DomainError('INVALID_PERSONA', 'ONBOARDING_WIRE_PERSONA')
  const avatarKind = value.avatarKind === 'gallery' || value.avatarKind === 'upload' || value.avatarKind === 'silhouette'
    ? value.avatarKind
    : 'silhouette'
  const runnerKind = value.runnerKind === 'cli' ? 'cli' : 'dsh'
  const roles = Array.isArray(value.systemRoles)
    ? value.systemRoles.filter((role): role is SystemRole =>
      role === 'coordination' || role === 'watchdog' || role === 'librarian' || role === 'team_manager')
    : []
  return {
    name,
    title,
    description: typeof value.description === 'string' ? value.description : '',
    personality: typeof value.personality === 'string' ? value.personality : '',
    instructions: typeof value.instructions === 'string' ? value.instructions : '',
    avatarKind,
    avatarRef: typeof value.avatarRef === 'string' ? value.avatarRef : 'neutral',
    runnerKind,
    runnerCli: typeof value.runnerCli === 'string' ? value.runnerCli : '',
    runnerModel: typeof value.runnerModel === 'string' ? value.runnerModel : 'default',
    canRecruit: value.canRecruit === true,
    systemRoles: withDefaultGestor(roles),
  }
}

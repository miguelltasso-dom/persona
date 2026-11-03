/**
 * Access-comparison and coordination-uniqueness rules for customizable personas.
 */

import {
  DomainError,
  type Persona,
  type PersonaProposal,
  type PersonaSpec,
  type ProposalPolicy,
  type SystemRole,
  type ToolLevel,
} from './schemas.ts'

const TOOL_RANK: Record<ToolLevel, number> = { none: 0, read: 1, write: 2 }

function toolLevel(tools: PersonaSpec['tools'], name: string): ToolLevel {
  const level = tools[name]
  return level === undefined ? 'none' : level
}

function limitExceeded(
  proposed: number | undefined,
  creator: number | undefined,
): boolean {
  if (proposed === undefined) return creator !== undefined
  if (creator === undefined) return false
  return proposed > creator
}

function runnerExceeds(proposed: PersonaSpec['runner'], creator: PersonaSpec['runner']): boolean {
  if (proposed.kind === 'dsh') return false
  if (creator.kind !== 'cli') return true
  return proposed.cli !== creator.cli
}

/**
 * Whether a proposed hire would receive more access than its creator.
 * Compares tool levels, new CLI credentials, limits, system roles, and recruit.
 * @param creator - The recruiting persona.
 * @param spec - The proposed colleague.
 */
export function proposalExceedsCreatorAccess(creator: Persona, spec: PersonaSpec): boolean {
  for (const name of Object.keys(spec.tools)) {
    if (TOOL_RANK[toolLevel(spec.tools, name)] > TOOL_RANK[toolLevel(creator.tools, name)]) return true
  }
  if (runnerExceeds(spec.runner, creator.runner)) return true
  if (limitExceeded(spec.limits.tokensPerMonth, creator.limits.tokensPerMonth)) return true
  if (limitExceeded(spec.limits.tokensPerResponse, creator.limits.tokensPerResponse)) return true
  if (limitExceeded(spec.limits.concurrency, creator.limits.concurrency)) return true
  if (spec.systemRoles.some(role => !creator.systemRoles.includes(role))) return true
  if (spec.canRecruit && !creator.canRecruit) return true
  return false
}

/**
 * Refuse a proposal that escalates access beyond the creator.
 * @param creator - The recruiting persona.
 * @param spec - The proposed colleague.
 */
export function assertProposalWithinCreatorAccess(creator: Persona, spec: PersonaSpec): void {
  if (proposalExceedsCreatorAccess(creator, spec)) throw new DomainError('ACCESS_ESCALATION')
}

/**
 * Personas in `workspaceId` that currently hold coordination.
 * @param personas - Workspace roster.
 * @param workspaceId - Workspace to inspect.
 */
export function coordinationHolders(personas: readonly Persona[], workspaceId: string): Persona[] {
  return personas.filter(persona =>
    persona.workspaceId === workspaceId && persona.systemRoles.includes('coordination'))
}

/**
 * Exactly one coordinator per workspace, or none (channels then work by @mention only).
 * @param personas - Roster that must already belong to one workspace, or several if ids differ.
 */
export function assertUniqueCoordination(personas: readonly Persona[]): void {
  const byWorkspace = new Map<string, number>()
  for (const persona of personas) {
    if (!persona.systemRoles.includes('coordination')) continue
    byWorkspace.set(persona.workspaceId, (byWorkspace.get(persona.workspaceId) ?? 0) + 1)
  }
  for (const count of byWorkspace.values()) {
    if (count > 1) throw new DomainError('COORDINATION_NOT_UNIQUE')
  }
}

function withRoles(persona: Persona, roles: readonly SystemRole[]): Persona {
  return { ...persona, systemRoles: [...new Set(roles)] }
}

/**
 * Create a hire proposal. Never grants more access than the creator.
 * Auto policy approves only after the same check.
 * @param input - Identity, creator, spec, and policy.
 */
export function personaPropose(input: {
  id: string
  workspaceId: string
  creator: Persona
  spec: PersonaSpec
  policy: ProposalPolicy
  createdAt: string
}): PersonaProposal {
  if (!input.creator.canRecruit || input.creator.workspaceId !== input.workspaceId) {
    throw new DomainError('ACL_DENIED')
  }
  assertProposalWithinCreatorAccess(input.creator, input.spec)
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    creatorPersonaId: input.creator.id,
    spec: input.spec,
    policy: input.policy,
    status: input.policy === 'auto' ? 'approved' : 'pending',
    createdAt: input.createdAt,
  }
}

/**
 * Assign a system function. Coordination moves: the previous holder loses it.
 * @param personas - Current roster.
 * @param personaId - Persona that receives the function.
 * @param role - Function to assign.
 * @returns A new roster array; input is not mutated.
 */
export function assignSystemRole(
  personas: readonly Persona[],
  personaId: string,
  role: SystemRole,
): Persona[] {
  const target = personas.find(persona => persona.id === personaId)
  if (target === undefined) throw new DomainError('UNKNOWN_PERSONA')
  const next = personas.map((persona) => {
    if (role === 'coordination') {
      if (persona.id === personaId) return withRoles(persona, [...persona.systemRoles, 'coordination'])
      if (persona.workspaceId === target.workspaceId) {
        return withRoles(persona, persona.systemRoles.filter(item => item !== 'coordination'))
      }
    }
    if (persona.id === personaId) return withRoles(persona, [...persona.systemRoles, role])
    return persona
  })
  assertUniqueCoordination(next)
  return next
}

/**
 * Customizable persona, team template, proposal, and company-vault records (SCOPE §1–§3).
 */

import { z } from 'zod'

const id = z.string().min(1).max(128)
const nonempty = z.string().min(1)
const shortText = nonempty.max(80)
const mediumText = z.string().max(2000)
const longText = z.string().max(8000)

/** Stable machine codes for domain validation and access-policy refusals. */
export type DomainErrorCode =
  | 'INVALID_PERSONA'
  | 'INVALID_TEMPLATE'
  | 'INVALID_PROPOSAL'
  | 'INVALID_VAULT_RECORD'
  | 'ACCESS_ESCALATION'
  | 'COORDINATION_NOT_UNIQUE'
  | 'UNKNOWN_PERSONA'
  | 'ACL_DENIED'
  | 'INVITE_INVALID'
  | 'CONNECTION_UNDECIDED'
  | 'SYNC_REFUSED'
  | 'IMPORT_REFUSED'

/** Domain validation or policy failure; message equals `code`. */
export class DomainError extends Error {
  /**
   * @param code - Stable machine code.
   * @param detail - Optional human-readable extra, never private content.
   */
  constructor(readonly code: DomainErrorCode, readonly detail?: string) {
    super(code)
    this.name = 'DomainError'
  }
}

/** Permission a persona may grant on one named tool. */
export const toolLevelSchema = z.enum(['none', 'read', 'write'])
export type ToolLevel = z.infer<typeof toolLevelSchema>

/** Assignable system functions. Coordination is unique per workspace. */
export const systemRoleSchema = z.enum(['coordination', 'watchdog'])
export type SystemRole = z.infer<typeof systemRoleSchema>

export const cliKindSchema = z.enum(['claude', 'codex', 'cursor', 'opencode'])
export type CliKind = z.infer<typeof cliKindSchema>

export const avatarSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gallery'), ref: nonempty.max(64) }),
  z.object({ kind: z.literal('upload'), ref: nonempty.max(512) }),
  z.object({ kind: z.literal('silhouette'), ref: nonempty.max(64) }),
])
export type PersonaAvatar = z.infer<typeof avatarSchema>

export const runnerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dsh'), model: nonempty.max(128) }),
  z.object({ kind: z.literal('cli'), cli: cliKindSchema, model: nonempty.max(128) }),
])
export type PersonaRunner = z.infer<typeof runnerSchema>

export const limitsSchema = z.object({
  tokensPerMonth: z.number().int().positive().optional(),
  tokensPerResponse: z.number().int().positive().optional(),
  concurrency: z.number().int().min(1).max(16).optional(),
})
export type PersonaLimits = z.infer<typeof limitsSchema>

export const weeklyHoursSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
})

export const scheduleSchema = z.object({
  timeZone: nonempty.max(64),
  weeklyHours: z.array(weeklyHoursSchema).max(21).optional(),
})
export type PersonaSchedule = z.infer<typeof scheduleSchema>

/** Fields a user or recruiter fills when creating or editing a persona. */
export const personaSpecSchema = z.object({
  name: shortText,
  avatar: avatarSchema,
  title: shortText,
  description: mediumText,
  personality: mediumText,
  instructions: longText,
  runner: runnerSchema,
  tools: z.record(z.string().min(1).max(64), toolLevelSchema),
  skills: z.array(nonempty.max(128)).max(64),
  limits: limitsSchema,
  schedule: scheduleSchema.optional(),
  reportsTo: id.optional(),
  systemRoles: z.array(systemRoleSchema).max(2),
  canRecruit: z.boolean(),
})
export type PersonaSpec = z.infer<typeof personaSpecSchema>

/** Persisted persona in a workspace. */
export const personaSchema = personaSpecSchema.extend({
  id,
  workspaceId: id,
  createdAt: nonempty,
  updatedAt: nonempty,
  createdBy: nonempty,
})
export type Persona = z.infer<typeof personaSchema>

export const proposalPolicySchema = z.enum(['auto', 'approval'])
export type ProposalPolicy = z.infer<typeof proposalPolicySchema>

/**
 * An agent-created hire request. The spec must not exceed the creator's access
 * (`assertProposalWithinCreatorAccess`).
 */
export const personaProposalSchema = z.object({
  id,
  workspaceId: id,
  creatorPersonaId: id,
  spec: personaSpecSchema,
  policy: proposalPolicySchema,
  status: z.enum(['pending', 'approved', 'rejected']),
  createdAt: nonempty,
})
export type PersonaProposal = z.infer<typeof personaProposalSchema>

export const vaultKindSchema = z.enum(['brief', 'constraint', 'decision', 'memory'])
export type VaultKind = z.infer<typeof vaultKindSchema>

export const vaultVisibilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workspace') }),
  z.object({ kind: z.literal('project'), projectId: id }),
  z.object({ kind: z.literal('persona'), personaId: id }),
  z.object({ kind: z.literal('members'), memberIds: z.array(id).min(1).max(64) }),
])
export type VaultVisibility = z.infer<typeof vaultVisibilitySchema>

/** Company-vault record with provenance; maps onto compileContext kinds. */
export const vaultRecordSchema = z.object({
  id,
  workspaceId: id,
  kind: vaultKindSchema,
  body: longText,
  factKey: nonempty.max(128).optional(),
  status: z.enum(['active', 'revoked']),
  sourceIds: z.array(id).max(64),
  authorId: nonempty,
  visibility: vaultVisibilitySchema,
  createdAt: nonempty,
  revision: z.number().int().min(1),
})
export type VaultRecord = z.infer<typeof vaultRecordSchema>

export const teamTemplateIdSchema = z.enum([
  'suggested-animals',
  'software-startup',
  'agency',
  'office',
  'blank',
])
export type TeamTemplateId = z.infer<typeof teamTemplateIdSchema>

export const teamTemplateSchema = z.object({
  id: teamTemplateIdSchema,
  name: shortText,
  description: mediumText,
  personas: z.array(personaSpecSchema).max(16),
})
export type TeamTemplate = z.infer<typeof teamTemplateSchema>

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, code: DomainErrorCode): T {
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  const message = parsed.error.issues[0]?.message
  throw message === undefined ? new DomainError(code) : new DomainError(code, message)
}

/**
 * @param input - Unknown payload at a parser/durable boundary.
 * @returns A validated persona.
 */
export function parsePersona(input: unknown): Persona {
  return parseOrThrow(personaSchema, input, 'INVALID_PERSONA')
}

/**
 * @param input - Unknown payload at a parser/durable boundary.
 * @returns A validated persona spec (no workspace identity yet).
 */
export function parsePersonaSpec(input: unknown): PersonaSpec {
  return parseOrThrow(personaSpecSchema, input, 'INVALID_PERSONA')
}

/**
 * @param input - Unknown payload at a parser/durable boundary.
 * @returns A validated hire proposal.
 */
export function parsePersonaProposal(input: unknown): PersonaProposal {
  return parseOrThrow(personaProposalSchema, input, 'INVALID_PROPOSAL')
}

/**
 * @param input - Unknown payload at a parser/durable boundary.
 * @returns A validated company-vault record.
 */
export function parseVaultRecord(input: unknown): VaultRecord {
  return parseOrThrow(vaultRecordSchema, input, 'INVALID_VAULT_RECORD')
}

/**
 * @param input - Unknown payload at a parser/durable boundary.
 * @returns A validated team template.
 */
export function parseTeamTemplate(input: unknown): TeamTemplate {
  return parseOrThrow(teamTemplateSchema, input, 'INVALID_TEMPLATE')
}

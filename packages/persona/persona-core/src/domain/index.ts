/**
 * Customizable personas, team templates, hire proposals, and the company vault.
 */

export {
  DomainError,
  avatarSchema,
  cliKindSchema,
  limitsSchema,
  parsePersona,
  parsePersonaProposal,
  parsePersonaSpec,
  parseTeamTemplate,
  parseVaultRecord,
  personaProposalSchema,
  personaSchema,
  personaSpecSchema,
  proposalPolicySchema,
  runnerSchema,
  scheduleSchema,
  systemRoleSchema,
  teamTemplateIdSchema,
  teamTemplateSchema,
  toolLevelSchema,
  vaultKindSchema,
  vaultRecordSchema,
  vaultVisibilitySchema,
  weeklyHoursSchema,
} from './schemas.ts'

export type {
  CliKind,
  DomainErrorCode,
  Persona,
  PersonaAvatar,
  PersonaLimits,
  PersonaProposal,
  PersonaRunner,
  PersonaSchedule,
  PersonaSpec,
  ProposalPolicy,
  SystemRole,
  TeamTemplate,
  TeamTemplateId,
  ToolLevel,
  VaultKind,
  VaultRecord,
  VaultVisibility,
} from './schemas.ts'

export {
  assertProposalWithinCreatorAccess,
  assertUniqueCoordination,
  assignSystemRole,
  coordinationHolders,
  personaPropose,
  proposalExceedsCreatorAccess,
} from './rules.ts'

export {
  assertCan,
  authorizeContext,
  authorizeRecall,
  can,
} from './acl.ts'

export type { AclAction, AclResource, Actor } from './acl.ts'

export {
  REQUIRED_VAULT_KINDS,
  canReadVault,
  compileVaultContext,
  isRequiredVaultKind,
  nextVaultRevision,
  requiredVaultIds,
  toContextRecord,
  vaultAppliesToProject,
  vaultSnapshot,
} from './vault.ts'

export { admitTrigger } from './admission.ts'
export type { Admission, AdmissionStrength } from './admission.ts'

export {
  HANDOFF_BUDGET_CHARS,
  HANDOFF_MAX_COUNT,
  HANDOFF_MAX_DEPTH,
  assertHandoffAllowed,
  claimHandoff,
  resolveHandoffRef,
} from './handoff.ts'
export type { HandoffEvidence, HandoffObject } from './handoff.ts'

export {
  applySkillEval,
  nextSkillVersion,
  publishSkill,
  rollbackSkill,
} from './skills.ts'
export type { SkillEval, SkillOrigin, SkillRecord, SkillScope } from './skills.ts'

export {
  contradicts,
  decayMemory,
  findNearDuplicate,
  nearDuplicate,
  reinforceMemory,
  restoreMemory,
  supersedeMemory,
} from './aging.ts'
export type { AgedMemory, MemoryLayer } from './aging.ts'

export { markdownToVault, memoryToMarkdown, vaultToMarkdown } from './markdown.ts'

export { TEAM_TEMPLATES, teamTemplateById } from './templates.ts'

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
  materializeSkills,
  nextSkillVersion,
  publishSkill,
  rollbackSkill,
  skillAdmitted,
} from './skills.ts'
export type {
  MaterializedSkills, SkillAudience, SkillEval, SkillOrigin, SkillRecord, SkillRuntime, SkillScope,
} from './skills.ts'

export { captureReplyTarget, replyUsesCapture } from './reply.ts'
export type { ReplyCapture } from './reply.ts'

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

export {
  applyGrant,
  inviteStatus,
  issueInvite,
  peerCanRead,
  purgeSource,
  redeemInvite,
  revokeGrant,
  revokeInvite,
} from './invite.ts'
export type { Grant, Invite } from './invite.ts'

export {
  CONNECTION_CAPABILITIES,
  chooseConnection,
  describeConnection,
  refuseSilentFallback,
} from './connection.ts'
export type { Connection, ConnectionCapabilities, ConnectionChoice, ConnectionKind } from './connection.ts'

export {
  canWithLayout,
  positionAffectsPolicy,
  relationGrantsAccess,
  relationStartsWork,
} from './relations.ts'
export type { CanvasPosition, Delegation, Relation, RelationKind } from './relations.ts'

export {
  applyVaultProposal,
  proposeVaultUpdate,
  vaultProposalExceedsCreator,
} from './vault-propose.ts'
export type { VaultProposal } from './vault-propose.ts'

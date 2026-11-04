/**
 * Customizable personas, team templates, hire proposals, and the company vault.
 */

export {
  DomainError,
  TEAM_MANAGER_ROLE,
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

export { looksLikeCredential } from './secrets.ts'

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
export { formatVaultCitation, toUsedDocumentCite } from './vault-cite.ts'
export type { UsedDocumentCite, VaultDocumentCite } from './vault-cite.ts'

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
export {
  evolveSkill,
  fakeSkillEvalPort,
  observeSkillAndMaybeRollback,
  scoreSkillExamples,
} from './skill-evolve.ts'
export type {
  SkillExample, SkillEvolveResult, SkillEvalPort, SkillPolicy, SkillScore,
} from './skill-evolve.ts'

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

export { ONBOARDING_TEMPLATE_IDS, TEAM_TEMPLATES, teamTemplateById } from './templates.ts'

export {
  completeOnboardingWire,
  parseCompleteOnboardingWire,
  personaSpecToOnboardingWire,
} from './onboarding-wire.ts'
export type {
  CompleteOnboardingInput,
  CompleteOnboardingWire,
  OnboardingPersonaWire,
} from './onboarding-wire.ts'

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

export {
  PERSONA_SHARE_KIND,
  PERSONA_SHARE_VERSION,
  TEAM_SHARE_KIND,
  exportPersonaFile,
  exportTeamFile,
  importPersonaFile,
  importTeamFile,
  personaShareJson,
  sanitizePersonaSpec,
  shareLooksLikeSecret,
  shareableAvatar,
  teamShareJson,
} from './share.ts'
export type { PersonaShareFile, ShareProvenance, TeamShareFile } from './share.ts'
export { defaultSkillDirIo, importCliSkillCandidates } from './cli-skills.ts'
export type { CliSkillCandidate, SkillDirIo } from './cli-skills.ts'

export {
  DEFAULT_SUBJECT_PACK,
  SUBJECT_COLORS,
  SUBJECT_COLOR_NAMES,
  activateSubject,
  archiveSubject,
  bindTicketToSubject,
  bumpUnread,
  defaultSubjects,
  filterMessagesBySubject,
  markSubjectWorking,
  moveMessageToSubject,
  renameSubject,
  subjectThreadKey,
  ticketSubjectChip,
} from './subjects.ts'
export type {
  ConversationMessage,
  ConversationRef,
  ConversationSubject,
  SubjectColor,
  SubjectColorIndex,
  TicketSubjectLink,
} from './subjects.ts'

export {
  BRAIN_PAGE_KINDS,
  BRAIN_PROPERTY_KEYS,
  assertBrainPage,
  backlinks,
  canReadBrain,
  canWriteBrain,
  indexBrainByKind,
  librarianHolders,
  nextBrainVersion,
  replaceBrainPage,
  resolveLibrarian,
  startHereLinks,
  touchBrainPage,
  vaultRecordToBrainPage,
  visibilityFromAudience,
} from './brain.ts'
export type {
  BrainPage,
  BrainPageKind,
  BrainSource,
  BrainSourceKind,
  BrainVersion,
  BrainVisibility,
} from './brain.ts'

export {
  BRAIN_CONFIRM_MS,
  acceptLibrarianProposal,
  applyHygiene,
  applyLibrarianActions,
  curateBrain,
  curateVisibility,
  hygieneBrain,
  hygieneChangedOnly,
} from './brain-curate.ts'
export type {
  HygieneReport,
  LibrarianAction,
  LibrarianFact,
  LibrarianPolicy,
} from './brain-curate.ts'

export {
  consultPermission,
  consultPermissionList,
  consultPermissionPages,
  grantFromPermissionPage,
  markPermissionUsed,
  permissionPageFromGrant,
  rememberPermission,
  revokePermission,
} from './brain-permission.ts'
export type {
  PermissionConsult,
  PermissionGrant,
  PermissionValidity,
} from './brain-permission.ts'

export {
  applyBrainPropose,
  brainPageToContextRecord,
  brainPropose,
  brainRead,
  brainSearch,
  brainSnapshot,
  compileBrainContext,
} from './brain-tools.ts'
export type {
  BrainProposal,
  BrainReadHop,
  BrainReadResult,
  BrainSearchHit,
} from './brain-tools.ts'

export { brainPageToMarkdown, exportBrainVault, leftoverDestFiles, markdownToBrainPage, planBrainVaultExport, shouldImportVaultFile } from './brain-markdown.ts'
export type { BrainVaultExport, BrainVaultExportPlan, BrainVaultFile } from './brain-markdown.ts'

export {
  EMPTY_LAYERS,
  appendTurn,
  assertTurnEntry,
  cacheHitRate,
  callsForTicket,
  estimateTokens,
  fitLayersToBudget,
  foldByKind,
  foldByPersona,
  foldUsagePanel,
  incrementalSubjectSummary,
  ledgerOriginOf,
  measureLayers,
  minifyToolDescription,
  sumLayers,
  tokensPerSuccessfulTask,
  totalTokens,
  turnFromLayers,
  usagePortKind,
} from './token-ledger.ts'
export type {
  LedgerOrigin,
  TurnKind,
  TurnLayerSizes,
  TurnLedgerEntry,
  UsagePanelFold,
  UsagePanelSlice,
  UsagePortKind,
} from './token-ledger.ts'

export {
  COMPOSER_SLASH_COMMANDS,
  asideStaysOffThread,
  composeCitedMessage,
  dropQueuedMessage,
  editQueuedMessage,
  enqueueWorkingMessage,
  matchComposerSlash,
  openAsideAsk,
  pauseAtLimit,
  resolveWorkingSend,
  resumeAfterLimit,
} from './working-send.ts'
export type { AsideAsk, CitedComposer, LimitPause, QueuedUserMessage, WorkingSendMode } from './working-send.ts'

export {
  activityCountsAsDone,
  groupTurnActivity,
  sortActivity,
  ACTIVITY_KIND_ORDER,
} from './activity.ts'
export type {
  ActivityGroupFold,
  TurnActivityEvent,
  TurnActivityKind,
  TurnActivityStatus,
} from './activity.ts'

export {
  DEFAULT_GESTOR_LIMITS,
  assembleTeamForGoal,
  assertGestorAllocate,
  assertGestorHire,
  assertGestorLimits,
  assertGestorReorganize,
  claimGestorScope,
  commentGestorPlan,
  gestorAllocate,
  applyGestorPlan,
  decideGestorAction,
  gestorDecisionRows,
  formatGestorAudit,
  isGestor,
  gestorHire,
  gestorHolders,
  gestorReorganize,
  gestorInScope,
  gestorInitiative,
  gestorScopeKey,
  resolveGestorTie,
} from './gestor.ts'
export type {
  GestorAllocation,
  GestorActionKind,
  GestorApproval,
  GestorAssemble,
  GestorAudit,
  GestorDecision,
  GestorInitiative,
  GestorLimits,
  GestorMandate,
  GestorPlan,
  GestorReorganize,
  GestorReorganizeKind,
  GestorScope,
} from './gestor.ts'

export {
  accountAskNeedsYou,
  accountSwitchActivity,
  assertIsolatedHomes,
  engineLabel,
  engineSwitchHandoff,
  normalizeAccountPolicy,
  pickAccount,
} from './account-policy.ts'
export type {
  AccountDecision,
  AccountEngine,
  AccountPolicy,
  AccountRotationPolicy,
  EngineSwitchHandoff,
  ProviderAccount,
  RunnerSwapPolicy,
} from './account-policy.ts'

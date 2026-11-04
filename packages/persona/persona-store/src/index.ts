/** Persona SQLite persistence: migrations, repositories, event log with per-stream sequence, FTS5. */

export { PACKAGE_STORE } from './identity.ts'

export {
  PERSONAL_PROJECT_NAME,
  PERSONA_APPLICATION_ID,
  PERSONA_BUSY_TIMEOUT_MS,
  PERSONA_SCHEMA_VERSION,
} from './constants.ts'

export { StoreError, STORE_USER_MESSAGES } from './errors.ts'
export type { StoreErrorCode } from './errors.ts'

export { PERSONA_MIGRATIONS } from './migrations.ts'
export type { Migration } from './migrations.ts'

export { PersonaStore, openPersonaStore } from './store.ts'
export type { OpenPersonaStoreOptions } from './store.ts'

export { wipeProject, wipeWorkspace } from './lifecycle/wipe.ts'

export { openTempStore, withTempStore } from './test-helpers.ts'
export type { OpenTempStoreOptions, TempStore } from './test-helpers.ts'

export { ProductRepos } from './product/repos.ts'
export type { ProductClock } from './product/repos.ts'
export { EventRepos } from './events/repos.ts'
export { seedScaleWorkspace, SCALE } from './scale/seed.ts'
export type {
  AppendEventInput,
  EventActor,
  EventPage,
  StoredEvent,
  StreamKind,
  StreamRecord,
} from './events/repos.ts'
export { zonedUtcMs } from './events/timezone.ts'

export { RoutineRepos } from './routines/repos.ts'
export type { CatchUp, CreateRoutineInput, Routine, RoutineRun } from './routines/repos.ts'

export { SqliteBoardRepos } from './board/repos.ts'
export type { BoardSnapshot } from './board/repos.ts'

export { SqliteMediaRepos } from './media/repos.ts'
export type { InsertAttachmentInput, StoredAttachment, StoredBlob } from './media/repos.ts'

export { SqliteCardRepos } from './card/repos.ts'
export type { PersonaChargeRow, PersonaSpeak } from './card/repos.ts'

export { SqliteGovernanceRepos } from './governance/repos.ts'
export type {
  GovernanceDump,
  StoredAwayWindow,
  StoredGovernanceAudit,
  StoredRoutineCharge,
  StoredSector,
} from './governance/repos.ts'

export { ProactivityRepos } from './proactivity/repos.ts'
export { ScreenRepos } from './screens/repos.ts'
export type { AutonomyMode, AutonomyRow, InitiativeFire, WatchdogAudit } from './proactivity/repos.ts'

export { SqliteRepositories, openSqliteRepositories } from './engine/repos.ts'
export { SqliteEffectPersistence } from './engine/effects.ts'
export { SqliteOutbox } from './engine/outbox.ts'
export type { OutboxPass } from './engine/outbox.ts'

export { SqliteRetention, applySqliteRetention } from './retention/store.ts'

export { SqliteUsageStore } from './usage/store.ts'
export type {
  QuotaRefillPoint,
  StoredOfficialQuota,
  StoredUsageEvent,
  UsageOrigin,
  UsageQuery,
  UsageStore,
  UsageTotals,
} from './usage/store.ts'
export { mergeQuotaHistory, QUOTA_REFILL_HISTORY } from './usage/store.ts'

export { TurnLedgerRepos } from './ledger/repos.ts'
export type { TurnLedgerQuery } from './ledger/repos.ts'

export { SqliteSyncLog } from './sync/log.ts'
export { SqliteImportStore } from './import/store.ts'
export { SqliteInviteBook } from './invite/book.ts'
export type { InviteBook } from './invite/book.ts'
export { MemoryInviteBook } from './invite/memory.ts'

export { VaultRepos } from './vault/repos.ts'
export type {
  CreateVaultDocumentInput,
  CreateVaultRecordInput,
  IngestVaultDocumentInput,
  VaultChunk,
  VaultDocument,
  VaultVersion,
} from './vault/repos.ts'
export {
  VaultDocError,
  detectVaultKind,
  extractVaultDocument,
  joinExtracted,
  MAX_VAULT_DOC_BYTES,
  vaultDocTooLargeMessage,
} from './vault/extract.ts'
export type { ExtractedUnit, VaultDocKind } from './vault/extract.ts'
export { chunkExtracted, VAULT_CHUNK_TARGET } from './vault/chunk.ts'
export type { VaultChunkDraft } from './vault/chunk.ts'
export { sampleDocx, samplePdf } from './vault/samples.ts'

export { TopicRepos, DEFAULT_TOPIC_NAMES } from './topic/repos.ts'
export type { ConversationTopic } from './topic/repos.ts'

export { AccountRepos } from './account/repos.ts'
export type { AccountPolicy, ProviderAccount } from './account/repos.ts'

export { TeachRepos } from './teach/repos.ts'
export type { TeachArtifact } from './teach/repos.ts'

export { GestorRepos } from './gestor/repos.ts'
export { OptRepos } from './opt/repos.ts'
export type { BatchCursor, StoredLimitPool, TopicSummary } from './opt/repos.ts'
export { BrainRepos, BRAIN_KINDS, extractLinks, grantAllows } from './brain/repos.ts'
export type {
  BrainEditorKind,
  BrainGrant,
  BrainKind,
  BrainPage,
  BrainValidity,
  BrainVersion,
  GrantBrainInput,
  PutBrainPageInput,
} from './brain/repos.ts'

export type {
  Channel,
  CreateChannelInput,
  CreateDmInput,
  CreateMemberInput,
  CreateProjectInput,
  CreateWorkspaceInput,
  DirectMessage,
  Member,
  Participation,
  Project,
  StoredPersona,
  Workspace,
} from './product/types.ts'

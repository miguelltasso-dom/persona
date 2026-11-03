/** Persona SQLite persistence: migrations, repositories, event log with per-stream sequence, FTS5. */

export { PACKAGE_STORE } from './identity.ts'

export {
  PERSONAL_PROJECT_NAME,
  PERSONA_APPLICATION_ID,
  PERSONA_BUSY_TIMEOUT_MS,
  PERSONA_SCHEMA_VERSION,
} from './constants.ts'

export { StoreError } from './errors.ts'
export type { StoreErrorCode } from './errors.ts'

export { PERSONA_MIGRATIONS } from './migrations.ts'
export type { Migration } from './migrations.ts'

export { PersonaStore, openPersonaStore } from './store.ts'
export type { OpenPersonaStoreOptions } from './store.ts'

export { openTempStore, withTempStore } from './test-helpers.ts'
export type { OpenTempStoreOptions, TempStore } from './test-helpers.ts'

export { ProductRepos } from './product/repos.ts'
export type { ProductClock } from './product/repos.ts'
export { EventRepos } from './events/repos.ts'
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

export { ProactivityRepos } from './proactivity/repos.ts'
export { ScreenRepos } from './screens/repos.ts'
export type { AutonomyMode, AutonomyRow, InitiativeFire, WatchdogAudit } from './proactivity/repos.ts'

export { SqliteRepositories, openSqliteRepositories } from './engine/repos.ts'
export { SqliteEffectPersistence } from './engine/effects.ts'
export { SqliteOutbox } from './engine/outbox.ts'
export type { OutboxPass } from './engine/outbox.ts'

export { SqliteSyncLog } from './sync/log.ts'
export { SqliteImportStore } from './import/store.ts'
export { SqliteInviteBook } from './invite/book.ts'
export type { InviteBook } from './invite/book.ts'
export { MemoryInviteBook } from './invite/memory.ts'

export { VaultRepos } from './vault/repos.ts'
export type {
  CreateVaultDocumentInput,
  CreateVaultRecordInput,
  VaultDocument,
  VaultVersion,
} from './vault/repos.ts'

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

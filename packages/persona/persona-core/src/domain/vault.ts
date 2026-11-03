/**
 * Company-vault rules: kinds, revisions, visibility, and requireds for compileContext.
 * Persistence belongs to persona-store (Anvil).
 */

import { compileContext } from '../context/index.ts'
import type {
  CompiledContext, CompileContextInput, ContextRecord, ContextSnapshot,
} from '../context/types.ts'
import { can, type Actor } from './acl.ts'
import { DomainError, type VaultKind, type VaultRecord } from './schemas.ts'

/** Constraint and decision records must enter every compilation for a project. */
export const REQUIRED_VAULT_KINDS: readonly VaultKind[] = ['constraint', 'decision']

/**
 * @param kind - Vault record kind.
 * @returns Whether the kind is mandatory context.
 */
export function isRequiredVaultKind(kind: VaultKind): boolean {
  return kind === 'constraint' || kind === 'decision'
}

/**
 * @param current - Existing revision (≥ 1).
 * @returns The next monotonic revision.
 */
export function nextVaultRevision(current: number): number {
  if (!Number.isInteger(current) || current < 1) throw new DomainError('INVALID_VAULT_RECORD')
  return current + 1
}

/**
 * Whether a vault record applies to `projectId` (D-038: tenant = project).
 * Workspace/members/persona visibility applies to every project; project visibility is exact.
 * @param record - Vault record.
 * @param projectId - Compilation project.
 */
export function vaultAppliesToProject(record: VaultRecord, projectId: string): boolean {
  if (record.visibility.kind === 'project') return record.visibility.projectId === projectId
  return true
}

/**
 * @param actor - Authenticated reader.
 * @param record - Vault record.
 */
export function canReadVault(actor: Actor, record: VaultRecord): boolean {
  const resource: Extract<Parameters<typeof can>[2], { type: 'vault' }> = {
    type: 'vault',
    workspaceId: record.workspaceId,
    visibility: record.visibility,
    status: record.status,
    kind: record.kind,
  }
  if (record.visibility.kind === 'project') resource.projectId = record.visibility.projectId
  return can(actor, 'read', resource)
}

/**
 * Map a vault record onto a compileContext record. Persona visibility becomes `agentId`.
 * @param record - Vault record.
 * @param projectId - Compilation project (used when visibility is not project-scoped).
 */
export function toContextRecord(record: VaultRecord, projectId: string): ContextRecord {
  const mappedProjectId = record.visibility.kind === 'project' ? record.visibility.projectId : projectId
  const mapped: ContextRecord = {
    id: record.id,
    workspaceId: record.workspaceId,
    projectId: mappedProjectId,
    revision: record.revision,
    kind: record.kind,
    status: record.status,
    body: record.body,
    sourceIds: record.sourceIds,
  }
  if (record.visibility.kind === 'persona') mapped.agentId = record.visibility.personaId
  if (record.factKey !== undefined) mapped.factKey = record.factKey
  return mapped
}

/**
 * Active required vault ids for a project. Visibility is enforced later by authorize
 * so an inaccessible constraint/decision fails closed (`REQUIRED_CONTEXT_UNAVAILABLE`).
 * @param records - Workspace vault (no I/O).
 * @param projectId - Compilation project.
 */
export function requiredVaultIds(records: readonly VaultRecord[], projectId: string): string[] {
  return records
    .filter(record =>
      isRequiredVaultKind(record.kind)
      && record.status === 'active'
      && vaultAppliesToProject(record, projectId))
    .map(record => record.id)
    .sort()
}

/**
 * Build a compileContext snapshot from in-memory vault records.
 * @param records - Workspace vault.
 * @param projectId - Compilation project.
 * @param revision - Snapshot revision token from the host.
 */
export function vaultSnapshot(
  records: readonly VaultRecord[],
  projectId: string,
  revision: string,
): ContextSnapshot {
  return {
    revision,
    requiredIds: requiredVaultIds(records, projectId),
    records: records
      .filter(record => vaultAppliesToProject(record, projectId))
      .map(record => toContextRecord(record, projectId)),
  }
}

/**
 * Compile prompt context from vault records. Required constraint/decision ids are always listed.
 * @param input - Actor is unused here; authorization goes through `authorize`.
 */
export async function compileVaultContext(
  input: Omit<CompileContextInput, 'snapshot'> & {
    records: readonly VaultRecord[]
    snapshotRevision: string
  },
): Promise<CompiledContext> {
  const snapshot = vaultSnapshot(input.records, input.scope.projectId, input.snapshotRevision)
  return compileContext({
    scope: input.scope,
    snapshot,
    budgetTokens: input.budgetTokens,
    countTokens: input.countTokens,
    authorize: input.authorize,
  })
}

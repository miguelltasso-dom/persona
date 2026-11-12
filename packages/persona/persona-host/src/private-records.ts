/**
 * Who may read a Cofre record that was kept for ONE persona or for named members: the person who said it (or the named members), and NOBODY else, not even the
 * owner of the space. The product's own ACL (`canReadVault`) already says a human never reads a persona's record; the screens that read the records raw
 * (Memória, the export) did not, and a memory the owner said in a DM travelled, with the whole message, to every member who opened Memória (Carbon P1-NOVO).
 *
 * Pure, so every surface that lists records asks the same question.
 */
import type { ScreenRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import { SECRET_FACT_KEYS } from './cofre-migrate.ts'
import { memoryProofOf } from './owner-memory.ts'

/** The facts of a record this rule needs (a `VaultRecord` has them). */
export interface PrivateRecordFacts {
  readonly authorId: string
  readonly visibility: { readonly kind: string; readonly memberIds?: readonly string[] }
}

/**
 * @param record - The record being listed.
 * @param viewerId - The member looking; empty when nobody the host knows (nothing private is shown: it fails closed).
 * @param byId - Who said it when the record carries a proof of that (`proof.byId`); defaults to the record's author.
 * @returns Whether the viewer may read it. Team, project and every non-private record: always true here (their own rules decide).
 */
export function mayReadPrivateRecord(record: PrivateRecordFacts, viewerId: string, byId: string = record.authorId): boolean {
  switch (record.visibility.kind) {
    case 'persona':
      return viewerId !== '' && byId === viewerId
    case 'members':
      return viewerId !== '' && (record.visibility.memberIds ?? []).includes(viewerId)
    default:
      return true
  }
}

/** What the guard below reads: the vault and the screens' documents (where a memory keeps its proof). */
export interface PrivateRecordStores {
  readonly vault: VaultRepos
  readonly screens: ScreenRepos
}

/**
 * R2-04: a memory is also reachable BY ID (approve / edit / forget), outside the list. A record that is another project's, another workspace's, or private to somebody else is answered as
 * if it did not exist (`memory-not-found`: the id of a private record is never confirmed to who has no right to it). A pending proposal and an unknown id are the screens' own business.
 * @param stores - Vault and screens.
 * @param request - Which record, in which tenant.
 * @param viewerId - The member the host knows is asking (the session), never a field of the request.
 */
export function assertMemoryReachable(
  stores: PrivateRecordStores,
  request: { readonly workspaceId: string; readonly projectId: string; readonly id: string },
  viewerId: string,
): void {
  const record = stores.vault.getRecord(request.id)
  if (record === undefined) return
  // Only a memory or a rule is a MEMORY (what the screen lists and acts on): a record of another kind (a decision, a brief, a Cofre fact) and a connector's secret fact are not reachable here.
  if ((record.kind !== 'memory' && record.kind !== 'constraint') || (record.factKey !== undefined && SECRET_FACT_KEYS.includes(record.factKey))) throw new Error('memory-not-found')
  const elsewhere = record.workspaceId !== request.workspaceId || (record.visibility.kind === 'project' && record.visibility.projectId !== request.projectId)
  if (elsewhere || !mayReadPrivateRecord(record, viewerId, memoryProofOf(stores.screens, request.projectId, record.id)?.byId)) throw new Error('memory-not-found')
}

/**
 * R2-04: the "contexto usado" of a message lists the id of every record the project holds, the private ones as "restricted". The id of a record private to somebody else is not for
 * this reader (it is the key to the by-id paths); a row that is no vault record (a Task's brief, a document) stays.
 * @param stores - Vault and screens.
 * @param projectId - Tenant.
 * @param rows - The rows the host kept for a message or a Task.
 * @param viewerId - The member the host knows is asking.
 */
export function readableUsedRows<T extends { readonly id: string }>(stores: PrivateRecordStores, projectId: string, rows: readonly T[], viewerId: string): T[] {
  return rows.filter((row) => {
    const record = stores.vault.getRecord(row.id)
    return record === undefined || mayReadPrivateRecord(record, viewerId, memoryProofOf(stores.screens, projectId, record.id)?.byId)
  })
}

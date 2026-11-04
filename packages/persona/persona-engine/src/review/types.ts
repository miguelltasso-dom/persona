/**
 * ReviewDelivery port: prepare worktree, summarize a diff, accept/merge,
 * request changes, discard, sweep orphans. Anvil binds Remote; Lumen paints
 * the "Revisar" panel.
 */

import type { Assignment, Ticket } from '../core/model.ts'
import type { ReviewRestorePointId } from './restore-point-id.ts'

export type MergeMode = 'ff' | 'squash'

export interface ReviewWorktree {
  ticketId: string
  assignmentId: string
  branch: string
  path: string
}

export interface ReviewFileChange {
  path: string
  added: number
  deleted: number
}

export interface ReviewSummary {
  ticketId: string
  files: ReviewFileChange[]
  added: number
  deleted: number
  patch: string
  patchTruncated: boolean
  patchLimitBytes: number
  secretsRedacted: boolean
  testsClaimed: string[]
}

export type ReviewAcceptResult =
  | { kind: 'merged'; mode: MergeMode; restorePointId?: ReviewRestorePointId }
  | { kind: 'blocked'; explanation: string; conflicts?: ReviewFileConflict[] }

/** Exact private-snapshot version shown for one side of a file conflict. */
export interface ReviewFileVersion { hash: string; mode: '100644' | '100755' }

/** A missing side represents a deletion; the UI owns persona names and localized button labels. */
export interface ReviewFileConflict { path: string; user: ReviewFileVersion | null; persona: ReviewFileVersion | null }

/** Person-authorized choice for the exact versions displayed during review. */
export interface ReviewConflictResolution extends ReviewFileConflict { choice: 'keep_mine' | 'keep_persona' | 'keep_both' }

/** Explicit per-file conflict decisions; omitted decisions never overwrite a shared-file edit. */
export interface ReviewApplyOptions { conflicts?: readonly ReviewConflictResolution[] }

/** A private point from immediately before an application; usable for thirty days. */
export interface ReviewRestorePoint {
  id: ReviewRestorePointId
  ticketId: string
  createdAt: string
  expiresAt: string
  state: 'available' | 'undone' | 'expired'
  files: string[]
}

/** Undo refuses to overwrite files changed since the application. */
export type ReviewUndoResult = { kind: 'restored'; restorePointId: ReviewRestorePointId }
  | { kind: 'blocked'; explanation: string }
  | { kind: 'expired'; restorePointId: ReviewRestorePointId }

/**
 * Per-ticket git delivery. Writes stay inside the worktree. Never pushes.
 */
export interface ReviewDelivery {
  prepare(assignment: Pick<Assignment, 'id'> & { ticketId: string }): Promise<ReviewWorktree>
  summary(ticket: Pick<Ticket, 'id' | 'assignments'>): Promise<ReviewSummary>
  accept(ticket: Pick<Ticket, 'id'>, mode: MergeMode, options?: ReviewApplyOptions): Promise<ReviewAcceptResult>
  requestChanges(ticket: Pick<Ticket, 'id' | 'mandate'>, feedback: string): Promise<void>
  discard(ticket: Pick<Ticket, 'id'>): Promise<void>
  sweepOrphans(): Promise<string[]>
  /** List private restoration points when this delivery supports ordinary-folder history. */
  listRestorePoints?(): Promise<ReviewRestorePoint[]>
  /** Restore an application once, preserving later user edits by blocking when they conflict. */
  undoApply?(restorePointId: ReviewRestorePointId): Promise<ReviewUndoResult>
}

export const REVIEW_PATCH_LIMIT_BYTES = 32_768
/**
 * Start of the question a failed Aplicar (merge conflict) raises on the Ticket. The draft stays alive in its worktree, so
 * {@link hasPendingDelivery} reads this prefix on a blocked report as “the result is still waiting for the person” (FLOW-1b).
 */
export const REVIEW_CONFLICT_QUESTION = 'Não deu para integrar a Tarefa.'
export const REVIEW_BRANCH_PREFIX = 'persona/'

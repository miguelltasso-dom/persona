/**
 * ReviewDelivery port: prepare worktree, summarize a diff, accept/merge,
 * request changes, discard, sweep orphans. Anvil binds Remote; Lumen paints
 * the "Revisar" panel.
 */

import type { Assignment, Ticket } from '../core/model.ts'

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
  | { kind: 'merged'; mode: MergeMode }
  | { kind: 'blocked'; explanation: string }

/**
 * Per-ticket git delivery. Writes stay inside the worktree. Never pushes.
 */
export interface ReviewDelivery {
  prepare(assignment: Pick<Assignment, 'id'> & { ticketId: string }): Promise<ReviewWorktree>
  summary(ticket: Pick<Ticket, 'id' | 'assignments'>): Promise<ReviewSummary>
  accept(ticket: Pick<Ticket, 'id'>, mode: MergeMode): Promise<ReviewAcceptResult>
  requestChanges(ticket: Pick<Ticket, 'id' | 'mandate'>, feedback: string): Promise<void>
  discard(ticket: Pick<Ticket, 'id'>): Promise<void>
  sweepOrphans(): Promise<string[]>
}

export const REVIEW_PATCH_LIMIT_BYTES = 32_768
export const REVIEW_BRANCH_PREFIX = 'persona/'

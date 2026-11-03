/**
 * ReviewDelivery over the `git` on PATH. Argv only; no shell. Windows:
 * core.longpaths, no junction escape (confinePath), autocrlf left to the repo.
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Assignment, Ticket } from '../core/model.ts'
import type { Engine } from '../core/engine.ts'
import { canRetry } from '../core/stage.ts'
import { confinePath, confineSegment } from '../executor/confine.ts'
import { addWorktree, worktreePath } from '../executor/worktree.ts'
import { redactSecrets, testsClaimedOf } from './redact.ts'
import {
  REVIEW_BRANCH_PREFIX,
  REVIEW_PATCH_LIMIT_BYTES,
  type MergeMode,
  type ReviewAcceptResult,
  type ReviewDelivery,
  type ReviewFileChange,
  type ReviewSummary,
  type ReviewWorktree,
} from './types.ts'

export interface GitReviewOptions {
  projectRoot: string
  worktreesRoot: string
  baseBranch?: string
  git?: string
  patchLimitBytes?: number
  engine?: Pick<Engine, 'note' | 'report' | 'retryTicket'>
  ticketOf?: (id: string) => Ticket | undefined
  openTicketIds?: () => readonly string[]
}

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

function runGit(git: string, args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(git, args, { cwd, shell: false, windowsHide: true })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      resolvePromise({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      })
    })
  })
}

function branchOf(ticketId: string): string {
  return `${REVIEW_BRANCH_PREFIX}${confineSegment(ticketId)}`
}

/**
 * Parse `git diff --numstat`. Binary rows (`-`) count as 0; escaped paths drop.
 * @param text - numstat stdout.
 */
export function parseNumstat(text: string): ReviewFileChange[] {
  const files: ReviewFileChange[] = []
  for (const line of text.split('\n')) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line)
    if (match === null) continue
    const added = match[1] === '-' ? 0 : Number(match[1])
    const deleted = match[2] === '-' ? 0 : Number(match[2])
    const path = match[3] ?? ''
    if (path.includes('..') || path.startsWith('/') || path.includes('\\..')) continue
    files.push({ path, added, deleted })
  }
  return files
}

/**
 * Git-backed ReviewDelivery. Host supplies roots and the engine for ticket updates.
 */
export class GitReviewDelivery implements ReviewDelivery {
  private readonly git: string
  private readonly baseBranch: string
  private readonly patchLimit: number

  constructor(private readonly options: GitReviewOptions) {
    this.git = options.git ?? 'git'
    this.baseBranch = options.baseBranch ?? 'main'
    this.patchLimit = options.patchLimitBytes ?? REVIEW_PATCH_LIMIT_BYTES
  }

  /**
   * Create the ticket worktree/branch from the project base.
   * @param assignment - Assignment whose ticket owns the worktree.
   */
  async prepare(assignment: Pick<Assignment, 'id'> & { ticketId: string }): Promise<ReviewWorktree> {
    const ticketId = confineSegment(assignment.ticketId)
    const dest = worktreePath(this.options.worktreesRoot, ticketId)
    confinePath(this.options.worktreesRoot, ticketId)
    if (!existsSync(dest)) {
      await addWorktree(this.options.projectRoot, ticketId, dest, this.git)
      await runGit(this.git, ['-C', dest, 'config', 'core.longpaths', 'true'], dest)
    }
    return {
      ticketId,
      assignmentId: assignment.id,
      branch: branchOf(ticketId),
      path: dest,
    }
  }

  /**
   * Diff against the project base. Patch is byte-capped and secret-redacted.
   * @param ticket - Ticket whose worktree we summarize.
   */
  async summary(ticket: Pick<Ticket, 'id' | 'assignments'>): Promise<ReviewSummary> {
    const ticketId = confineSegment(ticket.id)
    const dest = worktreePath(this.options.worktreesRoot, ticketId)
    const num = await runGit(this.git, ['-C', dest, 'diff', '--numstat', this.baseBranch], dest)
    const files = parseNumstat(num.stdout)
    const raw = await runGit(this.git, ['-C', dest, 'diff', this.baseBranch], dest)
    const redacted = redactSecrets(raw.stdout)
    let patch = redacted.text
    const truncated = Buffer.byteLength(patch, 'utf8') > this.patchLimit
    if (truncated) patch = Buffer.from(patch, 'utf8').subarray(0, this.patchLimit).toString('utf8')
    const latest = ticket.assignments.at(-1)?.report?.summary
    return {
      ticketId,
      files,
      added: files.reduce((sum, file) => sum + file.added, 0),
      deleted: files.reduce((sum, file) => sum + file.deleted, 0),
      patch,
      patchTruncated: truncated,
      patchLimitBytes: this.patchLimit,
      secretsRedacted: redacted.redacted,
      testsClaimed: testsClaimedOf(latest),
    }
  }

  /**
   * Merge the ticket branch into the project base. Conflict → blocked, merge aborted.
   * @param ticket - Ticket to accept.
   * @param mode - Fast-forward or squash (project policy).
   */
  async accept(ticket: Pick<Ticket, 'id'>, mode: MergeMode): Promise<ReviewAcceptResult> {
    const ticketId = confineSegment(ticket.id)
    const branch = branchOf(ticketId)
    const root = this.options.projectRoot
    const mergeArgs = mode === 'ff'
      ? ['-C', root, 'merge', '--ff-only', branch]
      : ['-C', root, 'merge', '--squash', branch]
    const result = await runGit(this.git, mergeArgs, root)
    if (result.code !== 0) {
      await runGit(this.git, ['-C', root, 'merge', '--abort'], root)
      await runGit(this.git, ['-C', root, 'reset', '--merge'], root)
      const explanation = result.stderr.trim() || result.stdout.trim() || 'conflito no merge'
      if (this.options.ticketOf?.(ticketId) !== undefined) {
        await this.options.engine?.report(ticketId, {
          state: 'blocked',
          summary: explanation,
          question: `Não deu para integrar a Tarefa. ${explanation}`,
        })
      }
      return { kind: 'blocked', explanation }
    }
    if (mode === 'squash') {
      const commit = await runGit(this.git, ['-C', root, 'commit', '-m', `persona: ${ticketId}`], root)
      if (commit.code !== 0 && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
        const explanation = commit.stderr.trim() || 'squash sem commit'
        return { kind: 'blocked', explanation }
      }
    }
    return { kind: 'merged', mode }
  }

  /**
   * Reassign with feedback as a note. Mandate stays; a larger ask is a new Ticket.
   * @param ticket - Ticket under review.
   * @param feedback - What to change.
   */
  async requestChanges(ticket: Pick<Ticket, 'id' | 'mandate'>, feedback: string): Promise<void> {
    const engine = this.options.engine
    if (engine === undefined) return
    engine.note(ticket.id, feedback)
    const current = this.options.ticketOf?.(ticket.id)
    if (current !== undefined && canRetry(current)) {
      engine.retryTicket(ticket.id)
      return
    }
    engine.report(ticket.id, { state: 'failed', summary: 'ajustes pedidos' })
    engine.retryTicket(ticket.id)
  }

  /**
   * Remove the worktree and the ticket branch. Does not push.
   * @param ticket - Ticket to discard.
   */
  async discard(ticket: Pick<Ticket, 'id'>): Promise<void> {
    const ticketId = confineSegment(ticket.id)
    const dest = worktreePath(this.options.worktreesRoot, ticketId)
    const root = this.options.projectRoot
    await runGit(this.git, ['-C', root, 'worktree', 'remove', '--force', dest], root)
    await runGit(this.git, ['-C', root, 'branch', '-D', branchOf(ticketId)], root)
  }

  /**
   * Drop persona worktrees whose ticket is no longer open. Call on host resume.
   */
  async sweepOrphans(): Promise<string[]> {
    const root = this.options.projectRoot
    const listed = await runGit(this.git, ['-C', root, 'worktree', 'list', '--porcelain'], root)
    const open = new Set(this.options.openTicketIds?.() ?? [])
    const removed: string[] = []
    let current = ''
    for (const line of listed.stdout.split('\n')) {
      if (line.startsWith('worktree ')) current = line.slice('worktree '.length).trim()
      if (line.startsWith('branch refs/heads/')) {
        const branch = line.slice('branch refs/heads/'.length).trim()
        if (!branch.startsWith(REVIEW_BRANCH_PREFIX) || current === '') continue
        const ticketId = branch.slice(REVIEW_BRANCH_PREFIX.length)
        if (open.has(ticketId)) continue
        const dest = resolve(current)
        await runGit(this.git, ['-C', root, 'worktree', 'remove', '--force', dest], root)
        await runGit(this.git, ['-C', root, 'branch', '-D', branch], root)
        removed.push(ticketId)
      }
    }
    return removed
  }
}

/**
 * Bound path a fake runner may write inside a worktree.
 * @param worktree - Worktree root from {@link GitReviewDelivery.prepare}.
 * @param relative - File relative to the worktree.
 */
export function confineWorktreeWrite(worktree: string, relative: string): string {
  return confinePath(worktree, relative)
}

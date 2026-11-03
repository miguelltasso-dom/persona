/**
 * Per-ticket git worktree via argv (no shell). Safe on Windows.
 */

import { spawn } from 'node:child_process'
import { isAbsolute } from 'node:path'
import { confinePath, confineSegment } from './confine.ts'

/**
 * Build the `git worktree add` argv for a ticket branch.
 * @param repoRoot - Existing git checkout.
 * @param ticketId - Ticket id (used in the branch name).
 * @param dest - Destination directory for the worktree.
 */
export function worktreeArgv(repoRoot: string, ticketId: string, dest: string): string[] {
  const id = confineSegment(ticketId)
  return ['-C', repoRoot, 'worktree', 'add', dest, '-b', `persona/${id}`, 'HEAD']
}

/**
 * Suggested worktree directory for a ticket.
 * @param root - Parent directory (PERSONA_HOME/projects/<id>/worktrees).
 * @param ticketId - Ticket id.
 */
export function worktreePath(root: string, ticketId: string): string {
  return confinePath(root, confineSegment(ticketId))
}

/**
 * Run `git` with argv. Never uses `shell: true`.
 * @param repoRoot - Existing git checkout.
 * @param ticketId - Ticket id.
 * @param dest - Destination directory.
 * @param git - Git executable (default `git`).
 */
export function addWorktree(
  repoRoot: string,
  ticketId: string,
  dest: string,
  git: string = 'git',
): Promise<void> {
  const safeDest = isAbsolute(dest) ? dest : confinePath(repoRoot, dest)
  const args = worktreeArgv(repoRoot, ticketId, safeDest)
  return new Promise((resolve, reject) => {
    const child = spawn(git, args, { shell: false, windowsHide: true })
    const stderr: Buffer[] = []
    child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
    child.on('error', reject)
    child.on('close', (code: number | null) => {
      if (code === 0) resolve()
      else reject(new Error(`git worktree failed (${String(code)}): ${Buffer.concat(stderr).toString('utf8')}`))
    })
  })
}

/**
 * Automatic delivery selection for existing repositories and ordinary folders.
 */

import { join } from 'node:path'
import { confinePath, createReviewDelivery, type HistoryReviewOptions, type ReviewDelivery } from '@deepseek-ai/dsh-persona-engine'
import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'
import { createWindowsHistoryFileOps, resolveGitExecutable } from '@deepseek-ai/dsh-persona-runners'
import type { ProjectRuntime } from './orchestration.ts'

/**
 * Host-configured resource limits and executable; the engine resolves its defaults. `fileOps` is the copy layer of the draft:
 * on Windows it defaults to {@link createWindowsHistoryFileOps} (SW-5: hydrate an online-only OneDrive file before copying,
 * “Feche “planilha.xlsx”…” for a file another program holds, long paths), elsewhere to the engine's plain copy.
 */
export type HostReviewOptions = Pick<HistoryReviewOptions, 'maxCopyBytes' | 'gitTimeoutMs' | 'git' | 'now' | 'fileOps'>

/** @returns Private application data directory; ordinary-folder history never uses the project folder. */
export function reviewHomeOf(): string {
  const root = process.env.PERSONA_HOME ?? process.env.DSH_HOME
  if (root !== undefined && root !== '') return root
  if (process.env.VITEST === 'true') return process.cwd()
  throw new Error('persona-home-missing')
}

/**
 * Isolated worktrees for one project (`<PERSONA_HOME>/worktrees/<projectId>`).
 * @param projectId - Tenant.
 */
export function reviewTreesOf(projectId: string): string {
  return confinePath(join(reviewHomeOf(), 'worktrees'), projectId)
}

/**
 * @param product - Projects.
 * @param runtimes - Live engines.
 * @param projectId - Tenant.
 * @param options - Resource limits, executable and test clock.
 * @param resolveGit - Installed/bundled executable resolver; no shell or login is used.
 * @returns undefined when the project has no folder (task without code).
 */
export async function reviewDeliveryOf(
  product: ProductRepos,
  runtimes: Map<string, ProjectRuntime>,
  projectId: string,
  options: HostReviewOptions = {},
  resolveGit: typeof resolveGitExecutable = resolveGitExecutable,
): Promise<ReviewDelivery | undefined> {
  const project = product.getProject(projectId)
  const root = project?.rootPath
  if (root === undefined || root === '') return undefined
  const trees = reviewTreesOf(projectId)
  const rt = runtimes.get(projectId)
  const ticketOf = (id: string) => rt?.repo.tickets.get(id)
  const openTicketIds = () => rt?.repo.tickets.open().map(ticket => ticket.id) ?? []
  const bundled = process.env.PERSONA_BUNDLED_GIT
  const git = options.git ?? (await resolveGit({
    ...(bundled === undefined || bundled === '' ? {} : { bundledExecutable: bundled }),
    ...(options.gitTimeoutMs === undefined ? {} : { timeoutMs: options.gitTimeoutMs }),
  })).executable
  const fileOps = options.fileOps ?? (process.platform === 'win32' ? createWindowsHistoryFileOps() : undefined)
  return createReviewDelivery({
    ...options,
    ...(fileOps === undefined ? {} : { fileOps }),
    git,
    projectId,
    personaHome: reviewHomeOf(),
    projectRoot: root,
    worktreesRoot: trees,
    ...(rt === undefined ? {} : { engine: rt.engine }),
    ticketOf,
    openTicketIds,
  })
}

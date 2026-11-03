/**
 * Per-project GitReviewDelivery. No worktree when the project has no rootPath.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { GitReviewDelivery, type ReviewDelivery } from '@deepseek-ai/dsh-persona-engine'
import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type { ProjectRuntime } from './orchestration.ts'

/**
 * Isolated worktrees for one project (`<PERSONA_HOME>/worktrees/<projectId>`).
 * @param projectId - Tenant.
 */
export function reviewTreesOf(projectId: string): string {
  const root = process.env.PERSONA_HOME ?? process.env.DSH_HOME ?? process.cwd()
  return join(root, 'worktrees', projectId)
}

/**
 * @param product - Projects.
 * @param runtimes - Live engines.
 * @param projectId - Tenant.
 * @returns undefined when the project has no folder (task without code).
 */
export function reviewDeliveryOf(
  product: ProductRepos,
  runtimes: Map<string, ProjectRuntime>,
  projectId: string,
): ReviewDelivery | undefined {
  const project = product.getProject(projectId)
  const root = project?.rootPath
  if (root === undefined || root === '') return undefined
  const trees = reviewTreesOf(projectId)
  mkdirSync(trees, { recursive: true })
  const rt = runtimes.get(projectId)
  const ticketOf = (id: string) => rt?.repo.tickets.get(id)
  const openTicketIds = () => rt?.repo.tickets.open().map(ticket => ticket.id) ?? []
  if (rt === undefined) {
    return new GitReviewDelivery({ projectRoot: root, worktreesRoot: trees, ticketOf, openTicketIds })
  }
  return new GitReviewDelivery({
    projectRoot: root,
    worktreesRoot: trees,
    engine: rt.engine,
    ticketOf,
    openTicketIds,
  })
}

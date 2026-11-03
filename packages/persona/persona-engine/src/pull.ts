/**
 * Pull loop: finishing or blocking an Assignment assigns the next eligible ticket.
 * Dependents wake by event, not by polling.
 */

export type SettledReport = 'ready' | 'blocked' | 'failed' | 'dropped'

export interface EligibleTicket {
  id: string
  personaId: string
  priority: number
  deps: readonly string[]
  tools: readonly string[]
  estimatedTokens: number
}

export interface PullContext {
  now: number
  personaId: string
  running: number
  maxConcurrent: number
  remainingTokens: number
  remainingRuns: number
  allowedTools: readonly string[]
  /**
   * @param ticketId - Candidate ticket.
   */
  canAssign: (ticketId: string) => boolean
  completedIds: ReadonlySet<string>
}

/**
 * @param item - Backlog row.
 * @param ctx - Persona load and grants.
 */
export function isEligible(item: EligibleTicket, ctx: PullContext): boolean {
  if (item.personaId !== ctx.personaId) return false
  if (!ctx.canAssign(item.id)) return false
  if (ctx.running >= ctx.maxConcurrent) return false
  if (ctx.remainingRuns < 1) return false
  if (item.estimatedTokens > ctx.remainingTokens) return false
  if (item.tools.some(tool => !ctx.allowedTools.includes(tool))) return false
  return item.deps.every(dep => ctx.completedIds.has(dep))
}

/**
 * Highest priority eligible ticket, then stable id.
 * @param backlog - Project backlog (not yet assigned).
 * @param ctx - Persona load and grants.
 */
export function nextEligible(backlog: readonly EligibleTicket[], ctx: PullContext): EligibleTicket | undefined {
  return backlog
    .filter(item => isEligible(item, ctx))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0]
}

/**
 * Tickets whose last missing dep was `completedId`.
 * @param completedId - Ticket that just ended.
 * @param backlog - Waiting tickets.
 * @param completedIds - Already done, including `completedId`.
 */
export function wakeDependents(
  completedId: string,
  backlog: readonly EligibleTicket[],
  completedIds: ReadonlySet<string>,
): string[] {
  return backlog
    .filter(item => item.deps.includes(completedId) && item.deps.every(dep => completedIds.has(dep)))
    .map(item => item.id)
    .sort()
}

/**
 * After a settled report: wake dependents, then pull the next ticket for the same persona.
 * Attention (waiting on a person) is not a settled pull — the worker stays on that ticket.
 * @param report - Worker report state.
 * @param completedId - Ticket that settled, when it completed.
 * @param backlog - Remaining backlog.
 * @param ctx - Persona load and grants.
 */
export function afterAssignmentSettled(
  report: SettledReport,
  completedId: string | undefined,
  backlog: readonly EligibleTicket[],
  ctx: PullContext,
): { next?: EligibleTicket; wake: string[] } {
  const completedIds = new Set(ctx.completedIds)
  if (completedId !== undefined && (report === 'ready' || report === 'dropped')) completedIds.add(completedId)
  const wake = completedId === undefined ? [] : wakeDependents(completedId, backlog, completedIds)
  const next = nextEligible(backlog.filter(item => item.id !== completedId), { ...ctx, completedIds, running: Math.max(0, ctx.running - 1) })
  return next === undefined ? { wake } : { next, wake }
}

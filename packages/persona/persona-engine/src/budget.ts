/**
 * Attention and spend budgets. Acceptance rate feeds proposal frequency.
 */

export interface AttentionBudget {
  proposalsPerDay: number
  proposedToday: number
  silenceUntil: number
  tokensLeft: number
  runsLeft: number
  /** 0–1 rolling accept rate of this persona's proposals. */
  acceptanceRate: number
}

/**
 * @param budget - Current counters.
 * @param now - Fake or wall clock (ms).
 */
export function inSilence(budget: AttentionBudget, now: number): boolean {
  return now < budget.silenceUntil
}

/**
 * @param budget - Current counters.
 * @param now - Clock (ms).
 */
export function mayPropose(budget: AttentionBudget, now: number): boolean {
  if (inSilence(budget, now)) return false
  return budget.proposedToday < budget.proposalsPerDay
}

/**
 * Low acceptance stretches the interval; high acceptance keeps the base.
 * @param baseHours - Configured cadence.
 * @param acceptanceRate - 0–1.
 */
export function nextProposalIntervalHours(baseHours: number, acceptanceRate: number): number {
  const rate = Math.min(1, Math.max(0, acceptanceRate))
  return baseHours * (1 + (1 - rate))
}

/**
 * @param budget - Current counters.
 * @param tokens - Tokens just spent.
 * @param runs - Executions just spent.
 */
export function spend(budget: AttentionBudget, tokens: number, runs: number): AttentionBudget {
  return {
    ...budget,
    tokensLeft: Math.max(0, budget.tokensLeft - tokens),
    runsLeft: Math.max(0, budget.runsLeft - runs),
  }
}

/**
 * @param budget - Current counters.
 * @param accepted - Whether the person accepted the proposal.
 */
export function recordProposalOutcome(budget: AttentionBudget, accepted: boolean): AttentionBudget {
  const samples = 4
  const nextRate = (budget.acceptanceRate * (samples - 1) + (accepted ? 1 : 0)) / samples
  return {
    ...budget,
    proposedToday: budget.proposedToday + 1,
    acceptanceRate: nextRate,
  }
}

/**
 * Group leftover proposals into one digest instead of one ping each.
 * @param titles - Proposal titles for the day.
 */
export function proposalDigest(titles: readonly string[]): string {
  if (titles.length === 0) return ''
  return `Resumo (${titles.length}): ${titles.join('; ')}`
}

/** Leftover tokens/runs for one project in a shared PERSONA_HOME. */
export interface ProjectSpend {
  projectId: string
  tokensLeft: number
  runsLeft: number
}

/**
 * @param book - Per-project leftovers.
 * @param projectId - Project to read.
 */
export function leftoverOnProject(book: readonly ProjectSpend[], projectId: string): ProjectSpend | undefined {
  return book.find(row => row.projectId === projectId)
}

/**
 * Spending on project A must not draw from project B.
 * @param book - Per-project leftovers.
 * @param projectId - Project that would spend.
 * @param tokens - Tokens requested.
 * @param runs - Executions requested.
 */
export function maySpendOnProject(
  book: readonly ProjectSpend[],
  projectId: string,
  tokens: number,
  runs: number,
): boolean {
  const row = leftoverOnProject(book, projectId)
  if (row === undefined) return false
  return row.tokensLeft >= tokens && row.runsLeft >= runs
}

/**
 * @param book - Per-project leftovers.
 * @param projectId - Project that spent.
 * @param tokens - Tokens just spent.
 * @param runs - Executions just spent.
 */
export function spendOnProject(
  book: readonly ProjectSpend[],
  projectId: string,
  tokens: number,
  runs: number,
): ProjectSpend[] {
  return book.map(row => row.projectId === projectId
    ? {
      projectId: row.projectId,
      tokensLeft: Math.max(0, row.tokensLeft - tokens),
      runsLeft: Math.max(0, row.runsLeft - runs),
    }
    : row)
}

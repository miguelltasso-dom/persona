/**
 * Second-brain engine face: librarian after a finished task/conversation/
 * approval, and the remembered-permission approval gate (SECOND-BRAIN §2–§3).
 * Persistence is Anvil; MCP tool names are Rivet.
 */

import {
  acceptLibrarianProposal,
  applyHygiene,
  applyLibrarianActions,
  consultPermissionList,
  consultPermissionPages,
  curateBrain,
  hygieneBrain,
  markPermissionUsed,
  rememberPermission,
  revokePermission,
  type BrainPage,
  type LibrarianAction,
  type LibrarianFact,
  type LibrarianPolicy,
  type PermissionConsult,
  type PermissionGrant,
  type PermissionValidity,
} from '@deepseek-ai/dsh-persona-core'

export type { LibrarianAction, LibrarianFact, LibrarianPolicy, PermissionConsult, PermissionGrant }

/**
 * After a finished task, conversation or approval: extract durable facts.
 * Required rules/decisions stay as propose until a human accepts.
 * @param input - Facts, current pages, origin, policy.
 */
export function curateAfterWork(input: {
  readonly facts: readonly LibrarianFact[]
  readonly pages: readonly BrainPage[]
  readonly source: { readonly kind: 'task' | 'conversation' | 'approval'; readonly id: string }
  readonly visibility: BrainPage['visibility']
  readonly workspaceId: string
  readonly authorId: string
  readonly now: number
  readonly policy: LibrarianPolicy
}): { readonly actions: readonly LibrarianAction[]; readonly pages: readonly BrainPage[] } {
  const actions = curateBrain(input)
  return {
    actions,
    pages: applyLibrarianActions(input.pages, actions, input.authorId, input.now),
  }
}

/**
 * LLM-free hygiene pass. Duplicates are marked replaced; 90-day reminders listed.
 * @param pages - Current pages.
 * @param now - Clock (ms).
 */
export function runBrainHygiene(
  pages: readonly BrainPage[],
  now: number,
): {
  readonly reminders: readonly { readonly pageId: string; readonly silentDays: number }[]
  readonly pages: readonly BrainPage[]
} {
  const report = hygieneBrain(pages, now)
  return { reminders: report.reminders, pages: applyHygiene(pages, report) }
}

/**
 * Approval gate. Exact persona + action + target + limits. Never expands.
 * @param grants - Remembered permissions (or pages via {@link consultPermissionPages}).
 * @param ask - This sensitive call.
 */
export function gateRememberedPermission(
  grants: readonly PermissionGrant[],
  ask: {
    readonly personaId: string
    readonly action: string
    readonly target: string
    readonly now: number
  },
): PermissionConsult {
  return consultPermissionList(grants, ask)
}

/**
 * Same gate over *Permissão concedida* pages. Ambiguous properties ask again.
 * @param pages - Workspace pages.
 * @param ask - This sensitive call.
 */
export function gateRememberedPermissionPages(
  pages: readonly BrainPage[],
  ask: {
    readonly personaId: string
    readonly action: string
    readonly target: string
    readonly now: number
  },
): PermissionConsult {
  return consultPermissionPages(pages, ask)
}

/**
 * @param input - Human "Lembrar esta permissão" after an approval.
 */
export function rememberApprovalPermission(input: {
  readonly id: string
  readonly grantorId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly maxUses?: number
  readonly validity: PermissionValidity
  readonly now: number
}): PermissionGrant {
  return rememberPermission(input)
}

/**
 * Immediate revoke. The next identical action asks again.
 * @param grant - Current grant.
 */
export function revokeRememberedPermission(grant: PermissionGrant): PermissionGrant {
  return revokePermission(grant)
}

/**
 * Record that a skip spent one use (`once` becomes spent).
 * @param grant - Grant that just covered a call.
 */
export function spendRememberedPermission(grant: PermissionGrant): PermissionGrant {
  return markPermissionUsed(grant)
}

export { acceptLibrarianProposal }

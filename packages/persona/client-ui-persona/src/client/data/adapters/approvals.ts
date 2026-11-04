import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import type { ApprovalItem } from '../../approvals/mock-data.ts'
import { attachApprovalBrainFields } from '../../approvals/approval-brain-scope.ts'
import { normalizeCharacterId } from '../../governance/governance-ui-helpers.ts'

const PRIMARY: Record<ApprovalView['kind'], string> = {
  hire: 'action.primary.hire',
  vault: 'action.primary.vault',
  skill: 'action.primary.skill',
  attention: 'action.primary.attention',
}

/**
 * Optional hire fields the host adds (A-4). Older hosts omit them and the card degrades: no role → "Contratar {name}?",
 * no description → no intro line, no monthlyTasks → no cost line.
 */
export interface HostHireExtras {
  /** The role the proposed persona fills (spec.title). */
  readonly roleTitle?: string | undefined
  /** What the proposed persona does (spec.description). */
  readonly description?: string | undefined
  /** Average tasks per month, only when the host measured it. */
  readonly monthlyTasks?: number | undefined
}

/**
 * Optional fields of a Cofre update and of a card that waits on another (A-4b). Absent = the card says less, never guesses.
 */
export interface HostCardExtras {
  /** Which Cofre record changes ("Preço do pão"). */
  readonly changeField?: string | undefined
  readonly changeBefore?: string | undefined
  readonly changeAfter?: string | undefined
  /** Title of the card this one really depends on. */
  readonly dependsOnTitle?: string | undefined
}

export type HostHireCard = ApprovalView & HostHireExtras & HostCardExtras

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

/** One host card → reactive inbox card (status is the caller's business: the Decision store owns the lifecycle). */
export function approvalViewToItem(item: HostHireCard): ApprovalItem {
  const dependsOnTitle = nonEmpty(item.dependsOnTitle)
  const base: ApprovalItem = {
    id: item.id,
    kind: item.kind,
    title: item.title,
    question: item.question,
    primaryKey: PRIMARY[item.kind],
    proposerName: item.personaName,
    proposerPersonaId: item.personaId,
    ...(dependsOnTitle === undefined ? {} : { dependsOnTitle }),
  }
  if (item.kind === 'vault') {
    const vaultField = nonEmpty(item.changeField)
    const vaultBefore = nonEmpty(item.changeBefore)
    const vaultAfter = nonEmpty(item.changeAfter)
    return attachApprovalBrainFields({
      ...base,
      ...(vaultField === undefined ? {} : { vaultField }),
      ...(vaultBefore === undefined ? {} : { vaultBefore }),
      ...(vaultAfter === undefined ? {} : { vaultAfter }),
    }, item)
  }
  if (item.kind !== 'hire') return attachApprovalBrainFields(base, item)
  const hirePortraitKey = normalizeCharacterId(item.hireAvatarRef ?? item.title)
  const roleTitle = nonEmpty(item.roleTitle)
  const description = nonEmpty(item.description)
  // A count of zero or a non-number is "not measured", never "0 tasks".
  const monthlyTasks = typeof item.monthlyTasks === 'number' && Number.isFinite(item.monthlyTasks) && item.monthlyTasks > 0
    ? Math.round(item.monthlyTasks)
    : undefined
  const hireItem: ApprovalItem = {
    ...base,
    ...(hirePortraitKey === undefined ? {} : { hirePortraitKey }),
    ...(roleTitle === undefined ? {} : { hireRoleTitle: roleTitle }),
    ...(description === undefined ? {} : { hireDescription: description }),
    ...(monthlyTasks === undefined ? {} : { hireMonthlyTasks: monthlyTasks }),
  }
  return attachApprovalBrainFields(hireItem, item)
}

/** Pending host approvals → reactive inbox cards. */
export function approvalsToInbox(items: readonly ApprovalView[]): ApprovalItem[] {
  return items.filter(item => item.status === 'pending').map(approvalViewToItem)
}

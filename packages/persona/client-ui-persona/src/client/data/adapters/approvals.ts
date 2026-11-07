import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import type { ApprovalItem } from '../../approvals/mock-data.ts'
import { attachApprovalBrainFields } from '../../approvals/approval-brain-scope.ts'
import { actionPreviewFromApproval } from '../../approvals/action-approval.ts'
import { readConnectorAsk } from '../../approvals/connector-ask.ts'
import { normalizeCharacterId } from '../../governance/governance-ui-helpers.ts'
import type { ReviewedBySealReviewer } from '../../teamwork/ReviewedBySeal.tsx'

const PRIMARY: Record<ApprovalView['kind'], string> = {
  hire: 'action.primary.hire',
  vault: 'action.primary.vault',
  skill: 'action.primary.skill',
  attention: 'action.primary.attention',
  connector: 'action.primary.connector',
  // HT-9's preview card is not built yet: an `action` approval reads as a plain "Revisar" attention card (the host's own words).
  action: 'action.primary.attention',
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
  /** TEAM-8: o selo "Revisado por {R}" quando a entrega associada ao cartão já passou pela revisão de um colega. */
  readonly reviewedBy?: ReviewedBySealReviewer | undefined
}

export type HostHireCard = ApprovalView & HostHireExtras & HostCardExtras

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

/** The host's kinds the client has a card for; `action` (HT-9, not built yet) and a connector card with no usable ask read as attention. */
function clientKindOf(kind: ApprovalView['kind'], hasConnectorAsk: boolean, hasActionPreview: boolean): ApprovalItem['kind'] {
  if (kind === 'connector') return hasConnectorAsk ? 'connector' : 'attention'
  if (kind === 'action') return hasActionPreview ? 'action' : 'attention'
  return kind
}

/** One host card → reactive inbox card (status is the caller's business: the Decision store owns the lifecycle). */
export function approvalViewToItem(item: HostHireCard): ApprovalItem {
  const dependsOnTitle = nonEmpty(item.dependsOnTitle)
  // `kind: 'connector'` (Anvil, team-real.md §9) is newer than the host types: read as data. A card that does not say which connector
  // is missing degrades to a plain attention card with the host's own title and question (it is still a decision someone waits on).
  const connector = item.kind === 'connector' ? readConnectorAsk((item as { connector?: unknown }).connector) : undefined
  const actionPreview = item.kind === 'action' ? actionPreviewFromApproval(item) : undefined
  const kind = clientKindOf(item.kind, connector !== undefined, actionPreview !== undefined)
  const base: ApprovalItem = {
    id: item.id,
    kind,
    title: item.title,
    question: item.question,
    primaryKey: PRIMARY[kind],
    ...(connector === undefined ? {} : { connector }),
    ...(actionPreview === undefined ? {} : { actionPreview }),
    // An external action with no usable preview degrades to a plain card, but stays cancel-only: it must never be approved blind.
    ...(item.kind === 'action' && actionPreview === undefined ? { blindAction: true } : {}),
    proposerName: item.personaName,
    proposerPersonaId: item.personaId,
    ...(dependsOnTitle === undefined ? {} : { dependsOnTitle }),
    ...(item.reviewedBy === undefined ? {} : { reviewedBy: item.reviewedBy }),
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

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

/** One host card → reactive inbox card (status is the caller's business: the Decision store owns the lifecycle). */
export function approvalViewToItem(item: ApprovalView): ApprovalItem {
  const base: ApprovalItem = {
    id: item.id,
    kind: item.kind,
    title: item.title,
    question: item.question,
    primaryKey: PRIMARY[item.kind],
    proposerName: item.personaName,
    proposerPersonaId: item.personaId,
  }
  if (item.kind !== 'hire') return attachApprovalBrainFields(base, item)
  const hirePortraitKey = normalizeCharacterId(item.hireAvatarRef ?? item.title)
  const hireItem = hirePortraitKey === undefined ? base : { ...base, hirePortraitKey }
  return attachApprovalBrainFields(hireItem, item)
}

/** Pending host approvals → reactive inbox cards. */
export function approvalsToInbox(items: readonly ApprovalView[]): ApprovalItem[] {
  return items.filter(item => item.status === 'pending').map(approvalViewToItem)
}

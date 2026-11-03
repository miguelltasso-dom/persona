import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import type { ApprovalItem } from '../../approvals/mock-data.ts'

const PRIMARY: Record<ApprovalView['kind'], string> = {
  hire: 'action.primary.hire',
  vault: 'action.primary.vault',
  skill: 'action.primary.skill',
  attention: 'action.primary.attention',
}

/** Pending host approvals → reactive inbox cards. */
export function approvalsToInbox(items: readonly ApprovalView[]): ApprovalItem[] {
  return items
    .filter(item => item.status === 'pending')
    .map(item => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      question: item.question,
      primaryKey: PRIMARY[item.kind],
    }))
}

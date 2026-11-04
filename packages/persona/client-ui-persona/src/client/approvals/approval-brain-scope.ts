import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import type { ApprovalItem, ApprovalKind } from './mock-data.ts'

/** Machine action/target for {@link grantBrainPermission} until the host exposes them on {@link ApprovalView}. */
function machineAction(kind: ApprovalKind): string {
  if (kind === 'vault') return 'vault.update'
  if (kind === 'skill') return 'skill.activate'
  return 'attention.approve'
}

/** Stable target id for the gate (exact match with future engine asks). */
function machineTarget(kind: ApprovalKind, id: string): string {
  return `${kind}:${id}`
}

/** Fields needed to call `grantBrainPermission` after accept. */
export interface ApprovalBrainFields {
  readonly grantId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly personaName: string
}

/** Pending reactive approvals that can be remembered (not hire; needs persona id). */
export function approvalBrainFieldsFromView(view: ApprovalView): ApprovalBrainFields | undefined {
  if (view.kind === 'hire') return undefined
  if (view.personaId.trim() === '') return undefined
  return {
    grantId: `grant-${view.id}`,
    personaId: view.personaId,
    action: machineAction(view.kind),
    target: machineTarget(view.kind, view.id),
    personaName: view.personaName.trim() || view.personaId,
  }
}

/** Attach brain grant metadata to inbox cards. */
export function attachApprovalBrainFields(item: ApprovalItem, view: ApprovalView): ApprovalItem {
  const brain = approvalBrainFieldsFromView(view)
  return brain === undefined ? item : { ...item, brain }
}

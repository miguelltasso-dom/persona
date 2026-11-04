import type { ApprovalView } from '@deepseek-ai/dsh-persona-host/types'
import type { ApprovalItem } from './mock-data.ts'

/** Fields needed to call `grantBrainPermission` after accept. */
export interface ApprovalBrainFields {
  readonly grantId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly personaName: string
}

/**
 * Pending reactive approvals that can be remembered (not hire; needs persona id). The action and the target are the
 * HOST's own (`permissionAction` / `permissionTarget`, a stable resource such as `vault:<recordId>`): a target the UI
 * invents from the proposal id would never match the next ask, so without them nothing is offered to remember.
 */
export function approvalBrainFieldsFromView(view: ApprovalView): ApprovalBrainFields | undefined {
  if (view.kind === 'hire') return undefined
  if (view.personaId.trim() === '') return undefined
  const action = view.permissionAction?.trim() ?? ''
  const target = view.permissionTarget?.trim() ?? ''
  if (action === '' || target === '') return undefined
  return {
    grantId: `grant-${view.id}`,
    personaId: view.personaId,
    action,
    target,
    personaName: view.personaName.trim() || view.personaId,
  }
}

/** Attach brain grant metadata to inbox cards. */
export function attachApprovalBrainFields(item: ApprovalItem, view: ApprovalView): ApprovalItem {
  const brain = approvalBrainFieldsFromView(view)
  return brain === undefined ? item : { ...item, brain }
}

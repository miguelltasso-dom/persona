import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  AcceptWorkflowProposalRequest,
  ProjectScopeRequest,
  ProposeWorkflowRequest,
  WorkflowProposalView,
  WorkflowView,
} from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from './lumen-inject.ts'
import { unwrapRemote } from './remote-call.ts'

type BoardsRemoteWire = PersonaRemoteClient & {
  proposeWorkflow?(request: ProposeWorkflowRequest): Promise<RemoteResult<WorkflowProposalView>>
  acceptWorkflowProposal?(request: AcceptWorkflowProposalRequest): Promise<RemoteResult<WorkflowView>>
  rejectWorkflowProposal?(request: ProjectScopeRequest): Promise<RemoteResult<WorkflowView>>
}

/** Build the host accept payload from a Coordination card + column-dest map. */
export function buildAcceptWorkflowRequest(
  scope: ProjectScopeRequest,
  proposal: WorkflowProposalView,
  destByRemoved: Readonly<Record<string, string>>,
): AcceptWorkflowProposalRequest {
  return {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    columns: proposal.workflow.columns,
    fields: proposal.workflow.fields,
    template: proposal.template,
    ...(Object.keys(destByRemoved).length > 0 ? { destByRemoved } : {}),
  }
}

export async function proposeWorkflowRemote(
  persona: PersonaRemoteClient,
  request: ProposeWorkflowRequest,
): Promise<WorkflowProposalView> {
  const wire = persona as BoardsRemoteWire
  if (typeof wire.proposeWorkflow !== 'function') throw new Error('propose-unavailable')
  return unwrapRemote(await wire.proposeWorkflow(request))
}

/** Prefer `acceptWorkflowProposal`; fall back to `updateWorkflow` on older hosts. */
export async function acceptWorkflowProposalRemote(
  persona: PersonaRemoteClient,
  request: AcceptWorkflowProposalRequest,
): Promise<void> {
  const wire = persona as BoardsRemoteWire
  if (typeof wire.acceptWorkflowProposal === 'function') {
    await unwrapRemote(await wire.acceptWorkflowProposal(request))
    return
  }
  await unwrapRemote(await persona.updateWorkflow(request))
}

/** No-op when the host omits reject (UI still closes the card). */
export async function rejectWorkflowProposalRemote(
  persona: PersonaRemoteClient,
  scope: ProjectScopeRequest,
): Promise<void> {
  const wire = persona as BoardsRemoteWire
  if (typeof wire.rejectWorkflowProposal !== 'function') return
  await unwrapRemote(await wire.rejectWorkflowProposal(scope))
}

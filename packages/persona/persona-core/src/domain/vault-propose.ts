/**
 * Personas propose vault updates (S2). Same approval|auto policy as hire:
 * never more visibility or kind-power than the creator already has.
 */

import { can, type Actor } from './acl.ts'
import { DomainError, type ProposalPolicy, type VaultRecord, type VaultVisibility } from './schemas.ts'
import { nextVaultRevision } from './vault.ts'

export interface VaultProposal {
  id: string
  workspaceId: string
  creatorPersonaId: string
  recordId: string
  nextBody: string
  nextVisibility: VaultVisibility
  policy: ProposalPolicy
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

const VISIBILITY_RANK: Record<VaultVisibility['kind'], number> = {
  persona: 0,
  members: 1,
  project: 2,
  workspace: 3,
}

/**
 * Whether the proposed visibility is broader than the current record, or the
 * creator could not write that kind themselves.
 * @param creator - Proposing persona as an Actor.
 * @param current - Existing vault row.
 * @param nextVisibility - Requested visibility.
 */
export function vaultProposalExceedsCreator(
  creator: Actor,
  current: VaultRecord,
  nextVisibility: VaultVisibility,
): boolean {
  if (VISIBILITY_RANK[nextVisibility.kind] > VISIBILITY_RANK[current.visibility.kind]) return true
  return !can(creator, 'write', {
    type: 'vault',
    workspaceId: current.workspaceId,
    visibility: nextVisibility,
    status: current.status,
    kind: current.kind,
    ...(nextVisibility.kind === 'project' ? { projectId: nextVisibility.projectId } : {}),
  })
}

/**
 * @param input - Identity, creator, current record, next body/visibility, policy.
 */
export function proposeVaultUpdate(input: {
  id: string
  creator: Actor
  current: VaultRecord
  nextBody: string
  nextVisibility: VaultVisibility
  policy: ProposalPolicy
  createdAt: string
}): VaultProposal {
  if (input.creator.workspaceId !== input.current.workspaceId) throw new DomainError('ACL_DENIED')
  if (vaultProposalExceedsCreator(input.creator, input.current, input.nextVisibility)) {
    throw new DomainError('ACCESS_ESCALATION')
  }
  return {
    id: input.id,
    workspaceId: input.current.workspaceId,
    creatorPersonaId: input.creator.id,
    recordId: input.current.id,
    nextBody: input.nextBody,
    nextVisibility: input.nextVisibility,
    policy: input.policy,
    status: input.policy === 'auto' ? 'approved' : 'pending',
    createdAt: input.createdAt,
  }
}

/**
 * Apply an approved proposal. Revision still increases.
 * @param current - Vault row.
 * @param proposal - Approved proposal.
 */
export function applyVaultProposal(current: VaultRecord, proposal: VaultProposal): VaultRecord {
  if (proposal.status !== 'approved') throw new DomainError('ACL_DENIED', 'NOT_APPROVED')
  if (proposal.recordId !== current.id) throw new DomainError('INVALID_VAULT_RECORD')
  return {
    ...current,
    body: proposal.nextBody,
    visibility: proposal.nextVisibility,
    revision: nextVaultRevision(current.revision),
  }
}

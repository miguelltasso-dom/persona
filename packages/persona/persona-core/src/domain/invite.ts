/**
 * Workspace invites and grants (E7). Tokens are short-lived and single-use.
 * A grant is the only way a peer gains project/channel/DM access; friendship
 * alone never reads a DM or vault/memory derivative.
 */

import { can, type Actor } from './acl.ts'
import { DomainError } from './schemas.ts'
import type { AclResource } from './acl.ts'
import type { AgedMemory } from './aging.ts'
import type { VaultRecord } from './schemas.ts'

export interface Grant {
  workspaceRole: 'member' | 'guest'
  projectIds: readonly string[]
  channelIds: readonly string[]
  dmIds: readonly string[]
}

export interface Invite {
  id: string
  workspaceId: string
  token: string
  expiresAt: number
  grant: Grant
  usedAt?: number
  revokedAt?: number
}

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000

/**
 * @param now - Clock reading.
 * @param overrides - Identity and grant.
 */
export function issueInvite(
  now: number,
  overrides: Pick<Invite, 'id' | 'workspaceId' | 'token' | 'grant'> & { ttlMs?: number },
): Invite {
  return {
    id: overrides.id,
    workspaceId: overrides.workspaceId,
    token: overrides.token,
    expiresAt: now + (overrides.ttlMs ?? TOKEN_TTL_MS),
    grant: overrides.grant,
  }
}

/**
 * @param invite - Issued invite.
 * @param now - Clock reading.
 */
export function inviteStatus(invite: Invite, now: number): 'open' | 'used' | 'revoked' | 'expired' {
  if (invite.revokedAt !== undefined) return 'revoked'
  if (invite.usedAt !== undefined) return 'used'
  if (now >= invite.expiresAt) return 'expired'
  return 'open'
}

/**
 * @param invite - Invite to revoke.
 * @param now - Clock reading.
 */
export function revokeInvite(invite: Invite, now: number): Invite {
  if (invite.revokedAt !== undefined) return invite
  return { ...invite, revokedAt: now }
}

/**
 * First redeem wins. A used, revoked, or expired token fails.
 * @param invite - Open invite.
 * @param now - Clock reading.
 * @param actor - Redeemer (must share the workspace id after accept).
 */
export function redeemInvite(invite: Invite, now: number, actor: Actor): { invite: Invite; actor: Actor } {
  const status = inviteStatus(invite, now)
  if (status !== 'open') throw new DomainError('INVITE_INVALID', status.toUpperCase())
  if (actor.workspaceId !== invite.workspaceId) throw new DomainError('INVITE_INVALID', 'WORKSPACE')
  return { invite: { ...invite, usedAt: now }, actor: applyGrant(actor, invite.grant) }
}

/**
 * @param actor - Current actor.
 * @param grant - Rights to add.
 */
export function applyGrant(actor: Actor, grant: Grant): Actor {
  const next: Actor = {
    ...actor,
    workspaceRole: grant.workspaceRole === 'member' ? 'member' : actor.workspaceRole,
    projectIds: [...new Set([...actor.projectIds, ...grant.projectIds])],
  }
  const dmIds = [...new Set([...(actor.dmIds ?? []), ...grant.dmIds])]
  if (dmIds.length > 0) next.dmIds = dmIds
  return next
}

/**
 * Drop a grant mid-run. Subsequent `can()` calls see the reduced actor.
 * @param actor - Actor that held the grant.
 * @param grant - Rights to remove.
 */
export function revokeGrant(actor: Actor, grant: Grant): Actor {
  const projectIds = actor.projectIds.filter(id => !grant.projectIds.includes(id))
  const dmIds = (actor.dmIds ?? []).filter(id => !grant.dmIds.includes(id))
  const next: Actor = { ...actor, projectIds }
  if (dmIds.length > 0) next.dmIds = dmIds
  else delete next.dmIds
  return next
}

/**
 * A peer who was never granted the resource.
 * @param actor - Candidate reader.
 * @param resource - DM, vault, or message.
 */
export function peerCanRead(actor: Actor, resource: Extract<AclResource, { type: 'dm' | 'vault' | 'message' }>): boolean {
  return can(actor, 'read', resource)
}

/**
 * Revoke a source and archive derived vault/memory rows (never delete).
 * @param sourceId - Source being removed.
 * @param records - Vault rows that may cite it.
 * @param memories - Aged memories that may cite it.
 */
export function purgeSource(
  sourceId: string,
  records: readonly VaultRecord[],
  memories: readonly AgedMemory[],
): { records: VaultRecord[]; memories: AgedMemory[] } {
  return {
    records: records.map(record => record.sourceIds.includes(sourceId)
      ? { ...record, status: 'revoked' as const }
      : record),
    memories: memories.map(memory => memory.body.includes(sourceId) || memory.id === sourceId
      ? { ...memory, archived: true }
      : memory),
  }
}

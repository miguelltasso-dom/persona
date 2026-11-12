/**
 * Workspace ACL: `can(actor, action, resource)` plus compileContext/recall adapters.
 */

import type { ContextAuthorize, ContextRecord, RecallEvent } from '../context/types.ts'
import { DomainError, type SystemRole, type VaultKind, type VaultVisibility } from './schemas.ts'

/** Who is asking. Identity and membership come from the host, never from the model. */
export interface Actor {
  kind: 'user' | 'persona'
  id: string
  workspaceId: string
  workspaceRole: 'owner' | 'member' | 'guest'
  projectIds: readonly string[]
  dmIds?: readonly string[]
  systemRoles?: readonly SystemRole[]
  canRecruit?: boolean
}

export type AclAction =
  | 'read'
  | 'write'
  | 'delete'
  | 'create'
  | 'recruit'
  | 'assign_role'
  | 'decide'
  | 'reply'
  | 'recall'
  | 'approve'
  | 'follow'
  | 'manage'

export type AclResource =
  | { type: 'workspace'; workspaceId: string }
  | { type: 'project'; workspaceId: string; projectId: string }
  | { type: 'persona'; workspaceId: string; personaId: string }
  | { type: 'channel'; workspaceId: string; projectId: string }
  | { type: 'dm'; workspaceId: string; dmId: string; memberIds: readonly string[] }
  | { type: 'ticket'; workspaceId: string; projectId: string; assigneeId?: string }
  | {
    type: 'vault'
    workspaceId: string
    projectId?: string
    visibility: VaultVisibility
    status: 'active' | 'revoked'
    kind: VaultKind
  }
  | { type: 'proposal'; workspaceId: string; creatorPersonaId: string }
  | {
    type: 'message'
    workspaceId: string
    stream: 'channel' | 'dm'
    streamId: string
    projectId?: string
    memberIds?: readonly string[]
  }
  | { type: 'routine'; workspaceId: string; projectId: string }

function sameWorkspace(actor: Actor, workspaceId: string): boolean {
  return actor.workspaceId === workspaceId
}

function inProject(actor: Actor, projectId: string): boolean {
  return actor.projectIds.includes(projectId)
}

function isOwner(actor: Actor): boolean {
  return actor.workspaceRole === 'owner'
}

function isGuest(actor: Actor): boolean {
  return actor.workspaceRole === 'guest'
}

function hasRole(actor: Actor, role: SystemRole): boolean {
  return actor.systemRoles?.includes(role) === true
}

function inDm(actor: Actor, dmId: string, memberIds: readonly string[]): boolean {
  return memberIds.includes(actor.id) || actor.dmIds?.includes(dmId) === true
}

function vaultReadable(actor: Actor, resource: Extract<AclResource, { type: 'vault' }>): boolean {
  const readable = ((): boolean => {
    switch (resource.visibility.kind) {
      case 'workspace':
        return true
      case 'project':
        return inProject(actor, resource.visibility.projectId)
      case 'persona':
        return actor.kind === 'persona' && actor.id === resource.visibility.personaId
      case 'members':
        return resource.visibility.memberIds.includes(actor.id)
    }
  })()
  // A revoked record is read by the owner only (the audit of what the team forgot), and only when the SAME record would be read active: the private memory of a persona or of named members stays theirs.
  return resource.status === 'revoked' ? readable && isOwner(actor) : readable
}

function vaultWritable(actor: Actor, resource: Extract<AclResource, { type: 'vault' }>): boolean {
  if (resource.status === 'revoked') return false
  if (isGuest(actor)) return false
  if (resource.kind === 'constraint' || resource.kind === 'decision') {
    return isOwner(actor) || hasRole(actor, 'coordination')
  }
  if (!vaultReadable(actor, resource)) return false
  return isOwner(actor) || actor.workspaceRole === 'member' || hasRole(actor, 'coordination')
}

/**
 * Whether `actor` may perform `action` on `resource`.
 * @param actor - Authenticated user or persona.
 * @param action - Requested verb.
 * @param resource - Target already resolved by the host.
 */
export function can(actor: Actor, action: AclAction, resource: AclResource): boolean {
  if (!sameWorkspace(actor, resource.workspaceId)) return false

  if (action === 'manage' || action === 'assign_role') {
    return resource.type === 'workspace' && isOwner(actor)
  }
  if (action === 'recruit') {
    return !isGuest(actor) && actor.canRecruit === true
  }

  switch (resource.type) {
    case 'workspace':
      if (action === 'read') return true
      if (action === 'write' || action === 'delete' || action === 'create') return isOwner(actor)
      return false
    case 'project':
      if (action === 'read') return isOwner(actor) || inProject(actor, resource.projectId)
      if (action === 'write' || action === 'create' || action === 'delete') {
        return isOwner(actor) || (actor.workspaceRole === 'member' && inProject(actor, resource.projectId))
      }
      return false
    case 'persona':
      if (action === 'read') return !isGuest(actor) || resource.personaId === actor.id
      if (action === 'write' || action === 'delete') {
        return isOwner(actor) || resource.personaId === actor.id
      }
      if (action === 'create') return isOwner(actor) || actor.canRecruit === true
      return false
    case 'channel':
      if (action === 'read' || action === 'follow') {
        return isOwner(actor) || inProject(actor, resource.projectId)
      }
      if (action === 'write' || action === 'reply') {
        return hasRole(actor, 'coordination') && (isOwner(actor) || inProject(actor, resource.projectId))
      }
      if (action === 'decide') return hasRole(actor, 'coordination')
      return false
    case 'dm':
      if (action === 'read' || action === 'write' || action === 'reply' || action === 'recall') {
        return inDm(actor, resource.dmId, resource.memberIds)
      }
      return false
    case 'ticket': {
      const participates = isOwner(actor) || inProject(actor, resource.projectId)
        || resource.assigneeId === actor.id || hasRole(actor, 'coordination') || hasRole(actor, 'watchdog')
      if (action === 'read' || action === 'follow') return participates
      if (action === 'write' || action === 'create') {
        return isOwner(actor) || hasRole(actor, 'coordination') || resource.assigneeId === actor.id
      }
      if (action === 'decide') return hasRole(actor, 'coordination')
      if (action === 'delete') return isOwner(actor)
      return false
    }
    case 'vault':
      if (action === 'read' || action === 'recall') return vaultReadable(actor, resource)
      if (action === 'write' || action === 'create') return vaultWritable(actor, resource)
      if (action === 'delete') return isOwner(actor)
      return false
    case 'proposal':
      if (action === 'read') return !isGuest(actor) || resource.creatorPersonaId === actor.id
      if (action === 'create') return actor.canRecruit === true
      if (action === 'approve') return isOwner(actor) || hasRole(actor, 'coordination')
      if (action === 'delete') return isOwner(actor) || resource.creatorPersonaId === actor.id
      return false
    case 'message':
      if (resource.stream === 'dm') {
        const members = resource.memberIds ?? []
        if (action === 'read' || action === 'recall' || action === 'write') {
          return inDm(actor, resource.streamId, members)
        }
        return false
      }
      if (resource.projectId === undefined) return false
      if (action === 'read' || action === 'recall' || action === 'follow') {
        return isOwner(actor) || inProject(actor, resource.projectId)
      }
      if (action === 'write' || action === 'reply') {
        return hasRole(actor, 'coordination') && (isOwner(actor) || inProject(actor, resource.projectId))
      }
      return false
    case 'routine':
      if (action === 'read') return isOwner(actor) || inProject(actor, resource.projectId)
      if (action === 'write' || action === 'create' || action === 'delete') {
        return isOwner(actor) || hasRole(actor, 'coordination')
      }
      return false
  }
}

/**
 * Refuse when {@link can} is false.
 * @param actor - Authenticated user or persona.
 * @param action - Requested verb.
 * @param resource - Target already resolved by the host.
 */
export function assertCan(actor: Actor, action: AclAction, resource: AclResource): void {
  if (!can(actor, action, resource)) throw new DomainError('ACL_DENIED')
}

function vaultResourceFromRecord(item: ContextRecord): Extract<AclResource, { type: 'vault' }> {
  const kind: VaultKind = item.kind === 'constraint' || item.kind === 'decision'
    || item.kind === 'brief' || item.kind === 'memory'
    ? item.kind
    : 'memory'
  const visibility: VaultVisibility = item.agentId !== undefined
    ? { kind: 'persona', personaId: item.agentId }
    : { kind: 'project', projectId: item.projectId }
  return {
    type: 'vault',
    workspaceId: item.workspaceId,
    projectId: item.projectId,
    visibility,
    status: item.status === 'revoked' ? 'revoked' : 'active',
    kind,
  }
}

/**
 * compileContext authorize adapter: admits a record only when {@link can} allows read.
 * @param actor - Authenticated compiler.
 */
export function authorizeContext(actor: Actor): ContextAuthorize<ContextRecord> {
  return item => Promise.resolve(can(actor, 'read', vaultResourceFromRecord(item)))
}

/**
 * recall authorize adapter: admits an event only when {@link can} allows recall.
 * @param actor - Authenticated reader.
 */
export function authorizeRecall(actor: Actor): ContextAuthorize<RecallEvent> {
  return item => Promise.resolve(can(actor, 'recall', {
    type: 'message',
    workspaceId: item.workspaceId,
    stream: 'channel',
    streamId: item.subjectId,
    projectId: item.projectId,
  }))
}

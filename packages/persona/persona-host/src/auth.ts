/**
 * Server-side actor: local session is the workspace owner unless tests override.
 * Client `actorId` / `ownerId` are never trusted.
 */

import { can, type AclAction, type AclResource, type Actor } from '@deepseek-ai/dsh-persona-core'
import type { Member, ProductRepos } from '@deepseek-ai/dsh-persona-store'

/** Remotes that must not require a workspace member. */
export const ACL_EXCEPTIONS: Record<string, string> = {
  ping: 'liveness probe, no tenant',
  getOnboarding: 'workspace may not exist yet',
  suggestFirstRequests: 'pure text derivation from the caller\'s own text; runs before the workspace exists',
  completeOnboarding: 'creates the first owner',
  createWorkspace: 'creates the tenant; no member yet',
  exportDiagnostics: 'local support dump; actor is the session, no client ids',
  pickDirectory: 'Rivet OS dialog; host never opens it and has no tenant',
  backupNow: 'local VACUUM copy; no tenant',
  listBackups: 'local backup directory listing; no tenant',
  listStickers: 'frozen Brush catalog; no tenant',
  checkpointWal: 'local WAL truncate; no tenant',
  previewCliSkills: 'local Claude/Codex skill scan; no tenant',
  getStoreHealth: 'local db health; no tenant',
  restoreBackup: 'local backup restore; no tenant',
}

/**
 * Build the ACL actor for the local session.
 * @param product - Members and projects.
 * @param workspaceId - Workspace.
 * @param sessionMemberId - Override (tests / remote peer).
 */
export function resolveSessionActor(
  product: ProductRepos,
  workspaceId: string,
  sessionMemberId?: string,
): Actor | undefined {
  const members = product.listMembers(workspaceId)
  if (sessionMemberId !== undefined) {
    const chosen = members.find(item => item.id === sessionMemberId)
    return chosen === undefined ? undefined : actorOf(product, chosen)
  }
  const chosen = members.find(item => item.role === 'owner') ?? members[0]
  if (chosen === undefined) return undefined
  return actorOf(product, chosen)
}

/**
 * @param product - Projects.
 * @param member - Session member.
 */
export function actorOf(product: ProductRepos, member: Member): Actor {
  const projects = product.listProjects(member.workspaceId)
  const projectIds = member.role === 'owner'
    ? projects.map(item => item.id)
    : member.role === 'member'
      ? projects.filter(item => item.kind === 'shared').map(item => item.id)
      : []
  const dms = projects.flatMap(project => product.listDms(project.id))
    .filter(dm => dm.participantA === member.id || dm.participantB === member.id)
  return {
    kind: 'user',
    id: member.id,
    workspaceId: member.workspaceId,
    workspaceRole: member.role,
    projectIds,
    dmIds: dms.map(item => item.id),
  }
}

/**
 * @param actor - Session actor.
 * @param action - Verb.
 * @param resource - Target.
 */
export function sessionCan(actor: Actor, action: AclAction, resource: AclResource): boolean {
  return can(actor, action, resource)
}

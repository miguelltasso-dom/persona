import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { unwrapRemote } from '../data/remote-call.ts'
import { PersonaRemoteError } from './persona-remote-unwrap.ts'
import type { PersonaTenantScope } from './persona-remote-types.ts'

const TENANT_STORAGE_KEY = 'persona.tenant.v1'

export interface StoredTenant {
  readonly workspaceId: string
  readonly projectId: string
  readonly memberId: string
  readonly channelId?: string
}

export function readStoredTenant(): StoredTenant | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(TENANT_STORAGE_KEY)
    if (raw === null) return null
    return JSON.parse(raw) as StoredTenant
  } catch {
    return null
  }
}

export function writeStoredTenant(tenant: StoredTenant): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, JSON.stringify(tenant))
  } catch {
    /* private mode */
  }
}

/** Minimal Remote surface for tenant bootstrap. */
export interface TenantBootstrapRemote {
  listProjects(request: { workspaceId: string; projectId: string }): RemoteResult<unknown> | Promise<RemoteResult<unknown>>
  createWorkspace(request: { id: string; name: string; personalProjectId: string }): RemoteResult<unknown> | Promise<RemoteResult<unknown>>
  createMember(request: {
    id: string
    workspaceId: string
    projectId: string
    displayName: string
    handle: string
    role: 'owner'
  }): RemoteResult<unknown> | Promise<RemoteResult<unknown>>
  listChannels(request: { workspaceId: string; projectId: string }): RemoteResult<readonly { id: string; name: string }[]> | Promise<RemoteResult<readonly { id: string; name: string }[]>>
  createChannel(request: {
    id: string
    workspaceId: string
    projectId: string
    name: string
    topic: string
  }): RemoteResult<{ id: string }> | Promise<RemoteResult<{ id: string }>>
  getOnboarding(request: { workspaceId: string; projectId: string }): RemoteResult<{ firstUse: boolean; personalProjectId: string }> | Promise<RemoteResult<{ firstUse: boolean; personalProjectId: string }>>
}

/** Host/store duplicate id (`StoreError` code `conflict`). */
function isConflictError(error: unknown): boolean {
  if (error instanceof PersonaRemoteError) {
    return error.code === 'conflict' || error.hostMessage === 'conflict' || /conflict/i.test(error.message)
  }
  return error instanceof Error && (error.message === 'conflict' || /conflict/i.test(error.message))
}

/**
 * Ensure workspace, owner member, and #geral channel exist; persist ids locally.
 * @param remote - raw `ctx.remote.persona` (RemoteResult wire). Not the unwrapped proxy from {@link unwrapPersonaRemote}.
 */
export async function bootstrapPersonaTenant(remote: TenantBootstrapRemote): Promise<PersonaTenantScope> {
  const stored = readStoredTenant()
  const workspaceId = stored?.workspaceId ?? 'ws-persona-local'
  const projectId = stored?.projectId ?? 'proj-pessoal'
  // Same ids the host onboarding uses (persona-host onboarding.ts): owner member 'owner', channel 'geral'.
  // Different ids collide with UNIQUE(project_id, name) on channel and abort completeOnboarding.
  const memberId = stored?.memberId ?? 'owner'

  // The host answers listProjects with [] (not an error) when the workspace does not exist yet.
  let hasWorkspace = false
  try {
    const projects = await unwrapRemote(await Promise.resolve(remote.listProjects({ workspaceId, projectId })))
    hasWorkspace = Array.isArray(projects) && projects.length > 0
  } catch {
    hasWorkspace = false
  }

  if (!hasWorkspace) {
    try {
      await unwrapRemote(await Promise.resolve(remote.createWorkspace({ id: workspaceId, name: 'Persona', personalProjectId: projectId })))
    } catch (error) {
      if (!isConflictError(error)) throw error
      /* workspace already exists (race or listProjects still []) */
    }
    try {
      await unwrapRemote(await Promise.resolve(remote.createMember({
        id: memberId,
        workspaceId,
        projectId,
        displayName: 'Você',
        handle: 'owner',
        role: 'owner',
      })))
    } catch {
      /* member may exist */
    }
  }

  const channels = await unwrapRemote(await Promise.resolve(remote.listChannels({ workspaceId, projectId })))
  let channelId = stored?.channelId ?? channels.find(ch => ch.name === 'geral')?.id
  if (channelId === undefined) {
    try {
      const created = await unwrapRemote(await Promise.resolve(remote.createChannel({
        id: 'geral',
        workspaceId,
        projectId,
        name: 'geral',
        topic: 'Conversas',
      })))
      channelId = created.id
    } catch (error) {
      if (!isConflictError(error)) throw error
      const again = await unwrapRemote(await Promise.resolve(remote.listChannels({ workspaceId, projectId })))
      channelId = again.find(ch => ch.name === 'geral')?.id
      if (channelId === undefined) throw error
    }
  }

  const tenant: PersonaTenantScope = { workspaceId, projectId, memberId, channelId }
  writeStoredTenant({ workspaceId, projectId, memberId, channelId })
  return tenant
}

/** Whether host reports first-use onboarding (personas empty). */
export async function hostReportsFirstUse(remote: TenantBootstrapRemote, tenant: PersonaTenantScope): Promise<boolean> {
  const state = await unwrapRemote(await Promise.resolve(remote.getOnboarding(tenant)))
  return state.firstUse
}

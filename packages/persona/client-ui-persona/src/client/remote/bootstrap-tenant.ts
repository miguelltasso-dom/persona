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
  listProjects(request: { workspaceId: string; projectId: string }): unknown
  createWorkspace(request: { id: string; name: string; personalProjectId: string }): unknown
  createMember(request: {
    id: string
    workspaceId: string
    projectId: string
    displayName: string
    handle: string
    role: 'owner'
  }): unknown
  listChannels(request: { workspaceId: string; projectId: string }): readonly { id: string; name: string }[]
  createChannel(request: {
    id: string
    workspaceId: string
    projectId: string
    name: string
    topic: string
  }): { id: string }
  getOnboarding(request: { workspaceId: string; projectId: string }): { firstUse: boolean; personalProjectId: string }
}

/**
 * Ensure workspace, owner member, and #geral channel exist; persist ids locally.
 * @param remote - mounted `ctx.remote.persona`.
 */
export async function bootstrapPersonaTenant(remote: TenantBootstrapRemote): Promise<PersonaTenantScope> {
  const stored = readStoredTenant()
  const workspaceId = stored?.workspaceId ?? 'ws-persona-local'
  const projectId = stored?.projectId ?? 'proj-pessoal'
  const memberId = stored?.memberId ?? 'member-owner'

  let hasWorkspace = false
  try {
    await Promise.resolve(remote.listProjects({ workspaceId, projectId }))
    hasWorkspace = true
  } catch {
    hasWorkspace = false
  }

  if (!hasWorkspace) {
    await Promise.resolve(remote.createWorkspace({ id: workspaceId, name: 'Persona', personalProjectId: projectId }))
    try {
      await Promise.resolve(remote.createMember({
        id: memberId,
        workspaceId,
        projectId,
        displayName: 'Owner',
        handle: 'owner',
        role: 'owner',
      }))
    } catch {
      /* member may exist */
    }
  }

  const channels = await Promise.resolve(remote.listChannels({ workspaceId, projectId }))
  let channelId = stored?.channelId ?? channels.find(ch => ch.name === 'geral')?.id
  if (channelId === undefined) {
    const created = await Promise.resolve(remote.createChannel({
      id: 'ch-geral',
      workspaceId,
      projectId,
      name: 'geral',
      topic: 'Conversas',
    }))
    channelId = created.id
  }

  const tenant: PersonaTenantScope = { workspaceId, projectId, memberId, channelId }
  writeStoredTenant({ workspaceId, projectId, memberId, channelId })
  return tenant
}

/** Whether host reports first-use onboarding (personas empty). */
export async function hostReportsFirstUse(remote: TenantBootstrapRemote, tenant: PersonaTenantScope): Promise<boolean> {
  const state = await Promise.resolve(remote.getOnboarding(tenant))
  return state.firstUse
}

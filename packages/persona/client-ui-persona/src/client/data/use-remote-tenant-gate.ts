import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { LumenRemotePanelProps } from './lumen-inject.ts'
import type { PersonaTenantSnapshot } from './persona-tenant.ts'

export type RemoteTenantGate = 'loading' | 'error' | ProjectScopeRequest

/** Scope for Remote panels; never assume tenant is ready on first paint. */
export function readRemoteTenantGate(tenant: PersonaTenantSnapshot): RemoteTenantGate {
  if (tenant.status === 'error') return 'error'
  if (tenant.status !== 'ready' || tenant.scope === null) return 'loading'
  return {
    workspaceId: tenant.scope.workspaceId,
    projectId: tenant.scope.projectId,
  }
}

export function useRemoteTenantGate(useTenant: LumenRemotePanelProps['useTenant']): RemoteTenantGate {
  const tenant = useTenant(state => state)
  return readRemoteTenantGate(tenant)
}

import { useCallback, useEffect, useState } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { LumenRemotePanelProps } from './lumen-inject.ts'
import type { PersonaTenantSnapshot } from './persona-tenant.ts'
import { REMOTE_PANEL_TIMEOUT_MS } from './remote-panel-timeout.ts'

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

export interface RemoteTenantGateResult {
  readonly gate: RemoteTenantGate
  readonly retryBootstrap: () => void
}

/** Tenant gate with bootstrap timeout → error (retry resets timer). */
export function useRemoteTenantGate(useTenant: LumenRemotePanelProps['useTenant']): RemoteTenantGateResult {
  const tenant = useTenant(state => state)
  const gate = readRemoteTenantGate(tenant)
  const [retryGen, setRetryGen] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const retryBootstrap = useCallback(() => { setRetryGen(n => n + 1) }, [])

  useEffect(() => {
    setTimedOut(false)
    if (gate !== 'loading') return
    const id = setTimeout(() => { setTimedOut(true) }, REMOTE_PANEL_TIMEOUT_MS)
    return () => { clearTimeout(id) }
  }, [gate, retryGen])

  const effective: RemoteTenantGate = gate === 'loading' && timedOut ? 'error' : gate
  return { gate: effective, retryBootstrap }
}

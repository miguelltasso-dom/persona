import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const status = useTenant(t => t.status)
  const workspaceId = useTenant(t => t.scope?.workspaceId)
  const projectId = useTenant(t => t.scope?.projectId)
  const [retryGen, setRetryGen] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const retryBootstrap = useCallback(() => {
    setRetryGen(n => n + 1)
    setTimedOut(false)
  }, [])

  const waitingScope = status !== 'ready' || workspaceId === undefined || projectId === undefined

  useEffect(() => {
    if (!waitingScope) {
      setTimedOut(false)
      return
    }
    if (status === 'error') return
    setTimedOut(false)
    const id = setTimeout(() => { setTimedOut(true) }, REMOTE_PANEL_TIMEOUT_MS)
    return () => { clearTimeout(id) }
  }, [waitingScope, status, workspaceId, projectId, retryGen])

  const gate: RemoteTenantGate = useMemo(() => {
    if (status === 'error' || (waitingScope && timedOut)) return 'error'
    if (waitingScope) return 'loading'
    return { workspaceId: workspaceId!, projectId: projectId! }
  }, [status, waitingScope, timedOut, workspaceId, projectId])

  return { gate, retryBootstrap }
}

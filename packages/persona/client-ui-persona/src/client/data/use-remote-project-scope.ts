import { useMemo } from 'react'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { LumenRemotePanelProps } from './lumen-inject.ts'
import { type RemoteTenantGate, useRemoteTenantGate } from './use-remote-tenant-gate.ts'

type ShellSelector = <T>(selector: (state: ShellState) => T) => T

/** Tenant scope, optionally overridden by the open project workspace (PB-5). */
export function useRemoteProjectScope(
  useTenant: LumenRemotePanelProps['useTenant'],
  useShell?: ShellSelector,
): {
  readonly scope: ProjectScopeRequest | null
  readonly gate: RemoteTenantGate
  readonly retryBootstrap: () => void
  /** PB-5: set when Arquivos/Rotinas/Conversa saíram do quadro aberto. */
  readonly workspaceOverrideProjectId: string | null
} {
  const { gate, retryBootstrap } = useRemoteTenantGate(useTenant)
  const overrideProjectId = useShell?.(state => state.projectWorkspaceProjectId) ?? null
  const scope = useMemo((): ProjectScopeRequest | null => {
    if (gate === 'loading' || gate === 'error') return null
    if (overrideProjectId !== null && overrideProjectId.length > 0) {
      return { workspaceId: gate.workspaceId, projectId: overrideProjectId }
    }
    return gate
  }, [gate, overrideProjectId])
  return { scope, gate, retryBootstrap, workspaceOverrideProjectId: overrideProjectId }
}

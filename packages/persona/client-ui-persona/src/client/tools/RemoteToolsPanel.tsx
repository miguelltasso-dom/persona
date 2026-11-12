/** Configurações › Ferramentas, ligada ao host (item 26): `getConnectorCatalog` + `getConnectorHealth`. A host without them shows the honest error, never a made-up list. */

import { useCallback, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { LumenRemotePanelProps, PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteProjectScope } from '../data/use-remote-project-scope.ts'
import { ToolsView, type ToolsSurfaceState } from './ToolsView.tsx'
import { readCatalog, readHealth, type ToolCatalog, type ToolHealthLine } from './tools-model.ts'

/** The two Remotes of item 26.4 / 26.8 (typed loosely: the screen reads what it needs and drops the rest). */
interface ToolsWire {
  getConnectorCatalog?(request: ProjectScopeRequest): Promise<RemoteResult<unknown>>
  getConnectorHealth?(request: ProjectScopeRequest): Promise<RemoteResult<unknown>>
}

interface ToolsData {
  readonly catalog: ToolCatalog
  readonly health: readonly ToolHealthLine[]
}

export function RemoteToolsPanel({ persona, useTenant, useShell }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const wire = persona as PersonaRemoteClient & ToolsWire
  const key = scope === null ? '' : `${scope.workspaceId}:${scope.projectId}`
  const load = useCallback(async (): Promise<ToolsData> => {
    if (scope === null) throw new Error('no-scope')
    if (typeof wire.getConnectorCatalog !== 'function') throw new Error('no-catalog')
    const catalog = readCatalog(await unwrapRemote(await wire.getConnectorCatalog({ workspaceId: scope.workspaceId, projectId: scope.projectId })))
    if (catalog === undefined) throw new Error('bad-catalog')
    // The health lines are a bonus: a host that cannot say still shows the catalog (every connected tool reads as working, no word on it).
    let health: readonly ToolHealthLine[] = []
    if (typeof wire.getConnectorHealth === 'function') {
      try {
        health = readHealth(await unwrapRemote(await wire.getConnectorHealth({ workspaceId: scope.workspaceId, projectId: scope.projectId })))
      } catch { /* no health: no chips */ }
    }
    return { catalog, health }
  }, [scope, wire])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, key, load)
  const surface: ToolsSurfaceState = gate === 'error' ? 'error' : gate === 'loading' ? 'loading' : state.status === 'ready' ? 'ready' : state.status === 'error' ? 'error' : 'loading'
  return (
    <ToolsView
      state={surface}
      catalog={state.status === 'ready' ? state.data.catalog : undefined}
      health={state.status === 'ready' ? state.data.health : []}
      onRetry={() => { retryBootstrap(); retry() }}
    />
  )
}

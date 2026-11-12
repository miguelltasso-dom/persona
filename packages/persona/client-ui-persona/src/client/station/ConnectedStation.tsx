/**
 * COLHEITA 24: o cartão Estação de Agentes em Configurações › Conexões, ligado ao Remote do host. Cada ação devolve a view
 * inteira, então a tela nunca fica meio atualizada.
 */

import { useCallback, useState, type ReactNode } from 'react'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import type { RemoteLoadState } from '../data/remote-call.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteProjectScope } from '../data/use-remote-project-scope.ts'
import type { RemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { LocalePanelProps } from '../locale/panel-dicts.ts'
import { pt as stationDict, type StationKey } from '../locale/station/locales.ts'
import { StationCard, type StationViewUi } from './StationCard.tsx'

function surfaceOf(gate: RemoteTenantGate, state: RemoteLoadState<StationViewUi>): 'loading' | 'error' | 'ready' {
  if (gate === 'error') return 'error'
  if (gate === 'loading') return 'loading'
  if (state.status === 'loading') return 'loading'
  if (state.status === 'error') return 'error'
  return 'ready'
}

export function ConnectedStation({ persona, useTenant, useShell, dicts }: LumenRemotePanelProps & LocalePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async (): Promise<StationViewUi> => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.stationView({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, `${workspaceId ?? ''}:${projectId ?? ''}`, load)
  const [current, setCurrent] = useState<StationViewUi | undefined>(undefined)
  const [code, setCode] = useState<{ readonly code: string; readonly expiresAt: string } | undefined>(undefined)
  const view = current ?? (state.status === 'ready' ? state.data : undefined)

  const act = useCallback(async (call: () => Promise<StationViewUi>): Promise<void> => {
    setCurrent(await call())
  }, [])

  const t = (key: StationKey, params?: Readonly<Record<string, string | number>>): string => bindLocale(dicts?.station ?? stationDict, key, params)
  const actions = view === undefined || scope === null ? {} : {
    onIssue: async () => {
      setCode(await unwrapRemote(await persona.issueStationCode({ workspaceId: scope.workspaceId, projectId: scope.projectId })))
    },
    onPair: async (typed: string) => {
      const result = await unwrapRemote(await persona.pairStation({ workspaceId: scope.workspaceId, projectId: scope.projectId, code: typed }))
      if (!result.ok) throw new Error(result.line)
      setCode(undefined)
      await act(async () => unwrapRemote(await persona.stationView({ workspaceId: scope.workspaceId, projectId: scope.projectId })))
    },
    onToggle: async (running: boolean) => {
      await act(async () => unwrapRemote(await persona.setStationRunning({ workspaceId: scope.workspaceId, projectId: scope.projectId, running })))
    },
  }

  return (
    <StationCard
      state={surfaceOf(gate, state)}
      view={view}
      code={code}
      {...actions}
      onRetry={() => { retryBootstrap(); retry() }}
      t={t}
    />
  )
}

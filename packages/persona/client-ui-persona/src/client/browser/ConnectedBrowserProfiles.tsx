/**
 * Item 17 (colheita): o cartão Navegador em Configurações › Conexões, ligado ao Remote do host. Carrega a view e a
 * equipe (para o menu de liberação) juntas; cada ação devolve a view inteira, então a tela nunca fica meio atualizada.
 */

import { useCallback, useState, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import type { RemoteLoadState } from '../data/remote-call.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteProjectScope } from '../data/use-remote-project-scope.ts'
import type { RemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { LocalePanelProps } from '../locale/panel-dicts.ts'
import { pt as browserDict, type BrowserKey } from '../locale/browser/locales.ts'
import { BrowserProfilesCard, type BrowserPersonaOption } from './BrowserProfilesCard.tsx'
import { browserRows, type HostBrowserView } from './browser-wire.ts'

interface BrowserCardData {
  readonly view: HostBrowserView
  readonly personas: readonly BrowserPersonaOption[]
}

/** `view` é a view MAIS NOVA (a que uma ação devolveu, senão a carregada): o vazio vem dela, nunca do carregamento antigo (P1-10: criar o 1º perfil mantinha "Nenhum perfil ainda"). */
function surfaceOf(gate: RemoteTenantGate, state: RemoteLoadState<BrowserCardData>, view: HostBrowserView | undefined): 'loading' | 'error' | 'empty' | 'ready' {
  if (gate === 'error') return 'error'
  if (gate === 'loading') return 'loading'
  if (state.status === 'loading') return 'loading'
  if (state.status === 'error') return 'error'
  return (view ?? state.data.view).profiles.length === 0 ? 'empty' : 'ready'
}

export function ConnectedBrowserProfiles({ persona, useTenant, useShell, dicts }: LumenRemotePanelProps & LocalePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async (): Promise<BrowserCardData> => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    const [view, team] = await Promise.all([
      unwrapRemote(await persona.browserView({ workspaceId, projectId })),
      unwrapRemote(await persona.listTeam({ workspaceId, projectId })),
    ])
    return { view, personas: team.personas.map(item => ({ id: item.id, name: item.name })) }
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, `${workspaceId ?? ''}:${projectId ?? ''}`, load)
  const [current, setCurrent] = useState<HostBrowserView | undefined>(undefined)
  const loaded = state.status === 'ready' ? state.data : undefined
  const view = current ?? loaded?.view
  const personas = loaded?.personas ?? []

  const act = useCallback(async (call: () => Promise<RemoteResult<HostBrowserView>>): Promise<void> => {
    setCurrent(await unwrapRemote(await call()))
  }, [])

  const t = (key: BrowserKey, params?: Readonly<Record<string, string | number>>): string => bindLocale(dicts?.browser ?? browserDict, key, params)
  const actions = view === undefined || scope === null ? {} : {
    onCreate: (name: string) => act(() => persona.createBrowserProfile({ workspaceId: scope.workspaceId, projectId: scope.projectId, name })),
    onRename: (profileId: string, name: string) => act(() => persona.renameBrowserProfile({ workspaceId: scope.workspaceId, projectId: scope.projectId, profileId, name })),
    onGrant: (profileId: string, personaId: string) => act(() => persona.grantBrowserProfile({ workspaceId: scope.workspaceId, projectId: scope.projectId, profileId, personaId })),
    onRevoke: (profileId: string, personaId: string) => act(() => persona.revokeBrowserProfile({ workspaceId: scope.workspaceId, projectId: scope.projectId, profileId, personaId })),
    onTake: (profileId: string) => act(() => persona.takeBrowserProfile({ workspaceId: scope.workspaceId, projectId: scope.projectId, profileId })),
    onRelease: (profileId: string) => act(() => persona.releaseBrowserProfile({ workspaceId: scope.workspaceId, projectId: scope.projectId, profileId })),
    onClose: (profileId: string) => act(() => persona.closeBrowserProfile({ workspaceId: scope.workspaceId, projectId: scope.projectId, profileId })),
  }

  return (
    <BrowserProfilesCard
      state={surfaceOf(gate, state, view)}
      chromeMissing={view !== undefined && view.chrome === undefined}
      profiles={view === undefined ? [] : browserRows(view, personas)}
      personas={personas}
      {...actions}
      onRetry={() => { retryBootstrap(); retry() }}
      t={t}
    />
  )
}

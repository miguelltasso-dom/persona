/**
 * Item 15 (colheita) — Configurações › Cofre ligado ao Remote do host. Carrega as entradas e, a cada ação, relê a lista inteira:
 * a tela nunca fica meio atualizada. Nenhuma senha passa por aqui além da que a pessoa acabou de digitar no painel; o host a sela
 * e devolve só `hasSecret`.
 */

import { useCallback, useState, type ReactNode } from 'react'
import type { LumenRemotePanelProps } from '../data/lumen-inject.ts'
import type { RemoteLoadState } from '../data/remote-call.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteProjectScope } from '../data/use-remote-project-scope.ts'
import type { RemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { pt as cofreDict, type CofreKey } from '../locale/cofre/locales.ts'
import { CofreScreen } from './CofreScreen.tsx'
import { cofreGroups, type HostCofreEntry } from './cofre-wire.ts'

function surfaceOf(gate: RemoteTenantGate, state: RemoteLoadState<readonly HostCofreEntry[]>): 'loading' | 'error' | 'ready' {
  if (gate === 'error') return 'error'
  if (gate === 'loading') return 'loading'
  if (state.status === 'loading') return 'loading'
  if (state.status === 'error') return 'error'
  return 'ready'
}

/** The host refused a secret because the Windows vault cannot seal one on this computer (`vault_unavailable`). */
export function isVaultUnavailable(failure: unknown): boolean {
  return failure instanceof Error && /vault_unavailable|cofre.*indispon|vault.*unavailable/iu.test(failure.message)
}

export function ConnectedCofre({ persona, useTenant, useShell }: LumenRemotePanelProps): ReactNode {
  const { scope, gate, retryBootstrap } = useRemoteProjectScope(useTenant, useShell)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const load = useCallback(async (): Promise<readonly HostCofreEntry[]> => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    return unwrapRemote(await persona.listCofreEntries({ workspaceId, projectId }))
  }, [persona, workspaceId, projectId])
  const { state, retry } = usePersonaRemoteLoad(scope !== null, `${workspaceId ?? ''}:${projectId ?? ''}`, load)
  const [current, setCurrent] = useState<readonly HostCofreEntry[] | undefined>(undefined)
  const [sealable, setSealable] = useState(true)
  const entries = current ?? (state.status === 'ready' ? state.data : [])

  // Every write reads the list again; a refusal for the Windows vault turns Login and Chave off (the card keeps working).
  const act = useCallback(async <T,>(call: () => Promise<T>): Promise<T> => {
    if (workspaceId === undefined || projectId === undefined) throw new Error('no-scope')
    let value: T
    try {
      value = await call()
    } catch (failure) {
      if (isVaultUnavailable(failure)) setSealable(false)
      throw failure
    }
    setCurrent(await unwrapRemote(await persona.listCofreEntries({ workspaceId, projectId })))
    return value
  }, [persona, workspaceId, projectId])

  const t = (key: CofreKey, params?: Readonly<Record<string, string | number>>): string => bindLocale(cofreDict, key, params)
  // A save or a removal answers with nothing the screen needs (it reads the list again): the handlers return void.
  const quiet = async <T,>(call: () => Promise<T>): Promise<void> => { await act(call) }
  const actions = scope === null ? {} : {
    onSaveLogin: (input: { readonly id?: string; readonly site: string; readonly username: string; readonly password?: string; readonly title?: string }) =>
      quiet(async () => {
        // The host seals whatever it receives: a login never goes without a password until it keeps the sealed one on an edit (keepSecretOnEdit stays off until then).
        if (input.password === undefined) throw new Error(t('error.typePassword'))
        return unwrapRemote(await persona.saveCofreLogin({ workspaceId: scope.workspaceId, projectId: scope.projectId, ...input, password: input.password }))
      }),
    onSaveKey: (input: { readonly id?: string; readonly service: string; readonly secret?: string; readonly title?: string }) =>
      quiet(async () => {
        if (input.secret === undefined) throw new Error(t('error.typeSecret'))
        return unwrapRemote(await persona.saveCofreKey({ workspaceId: scope.workspaceId, projectId: scope.projectId, ...input, secret: input.secret }))
      }),
    onSaveCompany: (input: { readonly id?: string; readonly legalName: string; readonly document: string; readonly email?: string; readonly phone?: string; readonly address?: string }) =>
      quiet(async () => unwrapRemote(await persona.saveCofreCompany({ workspaceId: scope.workspaceId, projectId: scope.projectId, ...input }))),
    onRemove: (id: string) => quiet(async () => unwrapRemote(await persona.removeCofreEntry({ workspaceId: scope.workspaceId, projectId: scope.projectId, id }))),
    // The preview reads nothing into the Cofre; only the commit writes (and the list is read again after it).
    onPreviewImport: async (csv: string) => unwrapRemote(await persona.previewCofreImport({ workspaceId: scope.workspaceId, projectId: scope.projectId, csv })),
    onCommitImport: (csv: string) => act(async () => unwrapRemote(await persona.commitCofreImport({ workspaceId: scope.workspaceId, projectId: scope.projectId, csv }))),
  }

  return (
    <CofreScreen
      state={surfaceOf(gate, state)}
      groups={cofreGroups(entries)}
      sealable={sealable}
      {...actions}
      onRetry={() => { retryBootstrap(); retry() }}
      t={t}
    />
  )
}

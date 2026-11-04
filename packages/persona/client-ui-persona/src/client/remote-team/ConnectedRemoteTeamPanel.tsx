import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { InviteView, RemoteTeamAvailability, RemoteTeamState } from '@deepseek-ai/dsh-persona-host/types'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import { RemoteTeamPanel, type IssuedInviteView, type RemoteTeamBusy } from './RemoteTeamPanel.tsx'
import {
  inviteRows,
  remoteTeamErrorKind,
  type RemoteTeamErrorKind,
  type SharableChannel,
} from './remote-team-model.ts'

type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

interface Scope {
  readonly workspaceId: string
  readonly projectId: string
}

/** Superfície do Remote da Equipe remota (contrato `remote-team.md`); tudo opcional: host antigo = painel some. */
export interface RemoteTeamWire {
  getRemoteTeamAvailability?(request: Scope): unknown
  getRemoteTeamState?(request: Scope): unknown
  connectRemoteTeam?(request: Scope & { edgeUrl: string; channelIds: readonly string[] }): unknown
  acceptInvite?(request: Scope & { edgeUrl: string; token: string }): unknown
  issueInvite?(request: Scope & { inviteId: string; token: string; role: 'member' | 'guest' }): unknown
  listInvites?(request: Scope): unknown
  revokeMember?(request: Scope & { inviteId: string }): unknown
  syncRemoteTeam?(request: Scope): unknown
  listChannels?(request: Scope): unknown
}

export interface ConnectedRemoteTeamPanelProps {
  readonly t: Translate
  readonly remote: RemoteTeamWire
  readonly scope: Scope | null
  /** Intervalo do acompanhamento do estado (o host já sincroniza sozinho; isto só atualiza a tela). */
  readonly pollMs?: number
}

/** Desembrulha o RemoteResult preservando o `code` tipado do host (a tela decide o texto; o código não é a mensagem). */
async function settle(value: unknown): Promise<unknown> {
  const resolved = await Promise.resolve(value)
  if (!isRemoteResult(resolved)) return resolved
  if (resolved.ok) return resolved.value
  const error = (resolved.error ?? {}) as { code?: unknown; message?: unknown }
  throw Object.assign(
    new Error(typeof error.message === 'string' ? error.message : 'remote-error'),
    { code: typeof error.code === 'string' ? error.code : 'unknown' },
  )
}

function isState(value: unknown): value is RemoteTeamState {
  return typeof value === 'object' && value !== null
    && typeof (value as { status?: unknown }).status === 'string'
    && Array.isArray((value as { channelIds?: unknown }).channelIds)
}

function toChannels(value: unknown): readonly SharableChannel[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((row): row is { id: string; name: string } => typeof row === 'object' && row !== null
      && typeof (row as { id?: unknown }).id === 'string' && typeof (row as { name?: unknown }).name === 'string')
    .map(row => ({ id: row.id, name: row.name }))
}

/**
 * Equipe remota ligada ao host. O código do convite só vive em `issued` (estado de tela): nunca vai a localStorage,
 * log ou cache, e some ao tocar "Já enviei" ou ao sair da tela.
 */
export function ConnectedRemoteTeamPanel({ t, remote, scope, pollMs = 5_000 }: ConnectedRemoteTeamPanelProps): ReactNode {
  const [loaded, setLoaded] = useState(false)
  const [vault, setVault] = useState<RemoteTeamAvailability['vault'] | undefined>(undefined)
  const [state, setState] = useState<RemoteTeamState | null>(null)
  const [channels, setChannels] = useState<readonly SharableChannel[]>([])
  const [invites, setInvites] = useState<readonly InviteView[]>([])
  const [issued, setIssued] = useState<IssuedInviteView | null>(null)
  const [busy, setBusy] = useState<RemoteTeamBusy>(null)
  const [error, setError] = useState<RemoteTeamErrorKind | null>(null)
  const alive = useRef(true)
  const workspaceId = scope?.workspaceId
  const projectId = scope?.projectId
  const supported = remote.getRemoteTeamState !== undefined || remote.connectRemoteTeam !== undefined

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const read = useCallback(async (): Promise<void> => {
    if (workspaceId === undefined || projectId === undefined) return
    const request = { workspaceId, projectId }
    try {
      const [availability, current, list] = await Promise.all([
        remote.getRemoteTeamAvailability === undefined ? Promise.resolve(undefined) : settle(remote.getRemoteTeamAvailability(request)),
        remote.getRemoteTeamState === undefined ? Promise.resolve(null) : settle(remote.getRemoteTeamState(request)),
        remote.listChannels === undefined ? Promise.resolve([]) : settle(remote.listChannels(request)),
      ])
      if (!alive.current) return
      const next = isState(current) ? current : null
      setVault((availability as RemoteTeamAvailability | undefined)?.vault)
      setState(next)
      setChannels(toChannels(list))
      if (next !== null && next.role === 'owner' && remote.listInvites !== undefined) {
        const rows = await settle(remote.listInvites(request)).catch(() => [])
        if (alive.current && Array.isArray(rows)) setInvites(rows as readonly InviteView[])
      }
    } catch {
      /* host ocupado: mantém o que já mostra */
    } finally {
      if (alive.current) setLoaded(true)
    }
  }, [remote, workspaceId, projectId])

  useEffect(() => {
    if (!supported) return undefined
    void read()
    if (pollMs <= 0) return undefined
    const timer = setInterval(() => { void read() }, pollMs)
    return () => { clearInterval(timer) }
  }, [supported, read, pollMs])

  const run = useCallback(async (kind: Exclude<RemoteTeamBusy, null>, action: () => Promise<void>): Promise<void> => {
    setBusy(kind)
    setError(null)
    try {
      await action()
      await read()
    } catch (failure) {
      if (alive.current) setError(remoteTeamErrorKind(failure))
    } finally {
      if (alive.current) setBusy(null)
    }
  }, [read])

  if (!supported || scope === null) return null
  const request = { workspaceId: scope.workspaceId, projectId: scope.projectId }

  return (
    <RemoteTeamPanel
      t={t}
      loading={!loaded}
      vault={vault}
      state={state}
      channels={channels}
      invites={inviteRows(invites)}
      issued={issued}
      busy={busy}
      error={error}
      onConnect={(edgeUrl, channelIds) => {
        void run('connect', async () => {
          await settle(remote.connectRemoteTeam?.({ ...request, edgeUrl, channelIds }))
        })
      }}
      onAccept={(edgeUrl, token) => {
        void run('accept', async () => {
          await settle(remote.acceptInvite?.({ ...request, edgeUrl, token }))
        })
      }}
      onIssueInvite={(role) => {
        void run('invite', async () => {
          const inviteId = crypto.randomUUID()
          const created = await settle(remote.issueInvite?.({ ...request, inviteId, token: '', role }))
          const token = typeof (created as { token?: unknown } | null)?.token === 'string' ? (created as { token: string }).token : ''
          // Convite do edge: o host devolve o código só nesta resposta; sem código não há o que mostrar.
          if (token.length > 0 && state !== null) setIssued({ inviteId, token, edgeUrl: state.edgeUrl })
        })
      }}
      onDismissIssued={() => { setIssued(null) }}
      onRevoke={(inviteId) => {
        void run('revoke', async () => {
          await settle(remote.revokeMember?.({ ...request, inviteId }))
        })
      }}
      onSync={() => {
        void run('sync', async () => {
          const next = await settle(remote.syncRemoteTeam?.(request))
          if (isState(next) && alive.current) setState(next)
        })
      }}
    />
  )
}

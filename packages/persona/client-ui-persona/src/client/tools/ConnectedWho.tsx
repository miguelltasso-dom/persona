/** "Quem pode usar?" ligado ao host (item 26): o time (`listPersonas`) e as concessões (`listConnectorGrants`); marcar = `grantConnector` (leitura), desmarcar = `revokeConnector`. Sem um dos dois, a lista é só de leitura. */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import { personaPortrait } from '../second-brain/brain-ui-adapters.ts'
import type { ToolCard } from './tools-model.ts'
import { WhoPanel, type WhoSurfaceState } from './WhoPanel.tsx'
import { readGrants, refOfTool, type ToolGrant, type ToolRef, type WhoFace, type WhoRow } from './who-model.ts'

/** The four Remotes of the permission (ISO-2), typed loosely: the screen reads what it needs and drops the rest. */
interface WhoWire {
  listConnectorGrants?(request: ProjectScopeRequest): Promise<RemoteResult<unknown>>
  grantConnector?(request: ProjectScopeRequest & { personaId: string; connector: { cli: string; id: string; name: string }; access: 'read' | 'write' }): Promise<RemoteResult<unknown>>
  revokeConnector?(request: ProjectScopeRequest & { personaId: string; cli: string; connectorId: string }): Promise<RemoteResult<unknown>>
}

interface WhoData {
  readonly faces: readonly WhoFace[]
  readonly grants: readonly ToolGrant[]
}

export interface ConnectedWhoProps {
  readonly persona: PersonaRemoteClient
  readonly scope: { readonly workspaceId: string; readonly projectId: string }
  readonly card: ToolCard
  readonly onClose: () => void
}

export function ConnectedWho({ persona, scope, card, onClose }: ConnectedWhoProps): ReactNode {
  const wire = persona as PersonaRemoteClient & WhoWire
  const [data, setData] = useState<WhoData | undefined>(undefined)
  const [state, setState] = useState<WhoSurfaceState>('loading')
  const [reload, setReload] = useState(0)
  // The connector an existing grant pointed at, kept for the session: unticking the LAST face must not leave nothing to hand the host when someone ticks again.
  const [ref, setRef] = useState<ToolRef | undefined>(undefined)

  useEffect(() => {
    let live = true
    void (async () => {
      try {
        if (typeof wire.listConnectorGrants !== 'function') throw new Error('no-grants')
        const [rows, grants] = await Promise.all([
          unwrapRemote(await persona.listPersonas(scope)),
          unwrapRemote(await wire.listConnectorGrants(scope)),
        ])
        if (!live) return
        const read = readGrants(grants)
        setData({ faces: rows.map(row => ({ id: row.id, name: row.name, avatarSrc: personaPortrait(row) })), grants: read })
        const found = refOfTool(card, read)
        if (found !== undefined) setRef(found)
        setState('ready')
      } catch {
        if (live) setState('error')
      }
    })()
    return () => { live = false }
  }, [persona, wire, card, scope.workspaceId, scope.projectId, reload])

  const canWrite = typeof wire.grantConnector === 'function' && typeof wire.revokeConnector === 'function'
  const onToggle = useCallback(async (row: WhoRow, next: boolean): Promise<void> => {
    if (data === undefined || typeof wire.grantConnector !== 'function' || typeof wire.revokeConnector !== 'function') return
    if (next) {
      const connector = ref ?? refOfTool(card, data.grants)
      if (connector === undefined) throw new Error('no-ref')
      await unwrapRemote(await wire.grantConnector({ ...scope, personaId: row.face.id, connector, access: 'read' }))
    } else {
      for (const grant of row.grants) {
        await unwrapRemote(await wire.revokeConnector({ ...scope, personaId: row.face.id, cli: grant.cli, connectorId: grant.connectorId }))
      }
    }
    setReload(count => count + 1) // what the host holds is the truth: read it again
  }, [card, data, ref, scope, wire])

  return (
    <WhoPanel
      card={card}
      faces={data?.faces ?? []}
      grants={data?.grants ?? []}
      connectorRef={ref}
      state={state}
      onToggle={canWrite ? onToggle : undefined}
      onRetry={() => { setState('loading'); setReload(count => count + 1) }}
      onClose={onClose}
    />
  )
}

import { useMemo, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { EngineMissingBanner } from '../chat/EngineMissingBanner.tsx'
import type { EngineRemoteWire } from './engine-status.ts'
import { useEngineStatus } from './use-engine-status.ts'

export interface ConnectedEngineBannerProps extends PropsLocale<'persona.chat'> {
  readonly engineRemote: EngineRemoteWire
  readonly workspaceId: string | undefined
  readonly projectId: string | undefined
  readonly onConnect?: (() => void) | undefined
}

/**
 * FR-3: a faixa "Falta uma IA" ligada ao host (getEngineStatus). Faz polling barato; quando a IA conecta, os pedidos
 * retidos retomam no host e a faixa vira "IA conectada, retomando…" por alguns segundos.
 */
export function ConnectedEngineBanner({ t, engineRemote, workspaceId, projectId, onConnect }: ConnectedEngineBannerProps): ReactNode {
  const scope = useMemo(
    () => (workspaceId === undefined || projectId === undefined ? null : { workspaceId, projectId }),
    [workspaceId, projectId],
  )
  const { status, recheck } = useEngineStatus(engineRemote, scope, { enabled: scope !== null, pollMs: 4_000, readyPollMs: 8_000 })
  return (
    <EngineMissingBanner
      t={t}
      status={status}
      {...(onConnect === undefined ? {} : { onConnect })}
      onRecheck={() => { void recheck() }}
    />
  )
}

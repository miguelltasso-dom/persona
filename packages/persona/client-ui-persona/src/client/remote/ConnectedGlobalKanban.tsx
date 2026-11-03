import { useMemo, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../data/persona-tenant.ts'
import { KanbanWithReview } from '../review/KanbanWithReview.tsx'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedKanbanInjected {
  readonly persona: PersonaRemoteClient
  readonly refreshKanban: () => Promise<void>
  readonly hooks: {
    readonly live: HostObservable<PersonaLiveSnapshot>
    readonly tenant: HostObservable<PersonaTenantSnapshot>
  }
}

export type ConnectedGlobalKanbanProps = InjectFace<ConnectedKanbanInjected>

export function ConnectedGlobalKanban({
  persona,
  useLive,
  useTenant,
  refreshKanban,
}: ConnectedGlobalKanbanProps): ReactNode {
  const live = useLive(state => state)
  const tenant = useTenant(state => state)

  const scope: ProjectScopeRequest | null = useMemo(() => {
    if (tenant.status !== 'ready' || tenant.scope === null) return null
    return { workspaceId: tenant.scope.workspaceId, projectId: tenant.scope.projectId }
  }, [tenant])

  if (!live.ready) {
    return (
      <KanbanWithReview
        persona={persona}
        scope={scope}
        onMutate={() => { void refreshKanban() }}
        initialState="loading"
      />
    )
  }
  if (live.kanbanCards.length === 0) {
    return (
      <KanbanWithReview
        persona={persona}
        scope={scope}
        onMutate={() => { void refreshKanban() }}
        initialState="empty"
        initialCards={[]}
      />
    )
  }

  return (
    <KanbanWithReview
      persona={persona}
      scope={scope}
      initialCards={live.kanbanCards}
      onMutate={() => { void refreshKanban() }}
    />
  )
}

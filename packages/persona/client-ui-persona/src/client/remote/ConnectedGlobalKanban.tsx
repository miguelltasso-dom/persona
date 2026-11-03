import { useMemo, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProjectScopeRequest } from '@deepseek-ai/dsh-persona-host/types'
import { BoardsHome } from '../boards/BoardsHome.tsx'
import { deriveBoardSummaries } from '../boards/derive-board-summaries.ts'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../data/persona-tenant.ts'
import { pt as kanbanDict } from '../locale/kanban/locales.ts'
import { Button, UiIcon } from '../primitives/index.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { KanbanWithReview } from '../review/KanbanWithReview.tsx'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'
import styles from '../boards/Boards.module.css'

export interface ConnectedKanbanInjected {
  readonly persona: PersonaRemoteClient
  readonly refreshKanban: () => Promise<void>
  readonly hooks: {
    readonly live: HostObservable<PersonaLiveSnapshot>
    readonly tenant: HostObservable<PersonaTenantSnapshot>
  }
}

export type ConnectedGlobalKanbanProps = InjectFace<ConnectedKanbanInjected>

/** Quadros hub + per-project board (legacy slot key `kanban`). */
export function ConnectedGlobalKanban({
  persona,
  useLive,
  useTenant,
  refreshKanban,
}: ConnectedGlobalKanbanProps): ReactNode {
  const live = useLive(state => state)
  const tenant = useTenant(state => state)
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const t = (key: string) => bindLocale(kanbanDict, key)

  const scope: ProjectScopeRequest | null = useMemo(() => {
    if (tenant.status !== 'ready' || tenant.scope === null) return null
    return { workspaceId: tenant.scope.workspaceId, projectId: tenant.scope.projectId }
  }, [tenant.status, tenant.scope?.workspaceId, tenant.scope?.projectId])

  const summaries = useMemo(
    () => deriveBoardSummaries({
      projects: live.projects,
      kanbanCards: live.kanbanCards,
      nowRows: live.nowRows,
    }),
    [live.projects, live.kanbanCards, live.nowRows],
  )

  if (!live.ready) {
    return (
      <BoardsHome
        dict={kanbanDict}
        summaries={[]}
        surfaceState="loading"
        onOpenProject={() => {}}
      />
    )
  }

  if (openProjectId !== null) {
    const projectCards = live.kanbanCards.filter(card => card.projectId === openProjectId)
    const summary = summaries.find(row => row.id === openProjectId)
    return (
      <div className={styles.projectBoardWrap} data-persona-kanban="global">
        <div className={styles.backRow}>
          <Button
            variant="ghost"
            icon={<UiIcon name="chevronRight" size={18} className={styles.backChevron} />}
            onClick={() => { setOpenProjectId(null) }}
          >
            {t('boards.backToGrid')}
          </Button>
          {summary !== undefined && <span className={styles.backProjectName}>{summary.name}</span>}
        </div>
        <KanbanWithReview
          persona={persona}
          scope={scope}
          initialCards={projectCards}
          initialState={projectCards.length === 0 ? 'empty' : 'ready'}
          onMutate={() => { void refreshKanban() }}
        />
      </div>
    )
  }

  return (
    <BoardsHome
      dict={kanbanDict}
      summaries={summaries}
      surfaceState="ready"
      onOpenProject={setOpenProjectId}
    />
  )
}

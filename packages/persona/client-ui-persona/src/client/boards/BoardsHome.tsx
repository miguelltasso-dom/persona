/** §1 Quadros — project grid (BOARDS-SPEC). */

import { useMemo, useState, type ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, EmptyState, Screen, ScreenHeader, Skeleton, Tabs, UiIcon } from '../primitives/index.ts'
import { ProjectBoardCard } from './ProjectBoardCard.tsx'
import styles from './Boards.module.css'
import type { BoardsFilterTab, BoardsSurfaceState, ProjectBoardSummary } from './types.ts'

export interface BoardsHomeProps {
  readonly dict: LocaleDict
  readonly summaries: readonly ProjectBoardSummary[]
  readonly surfaceState?: BoardsSurfaceState
  readonly onOpenProject: (projectId: string) => void
  readonly onNewProject?: () => void
  readonly onGlobalView?: () => void
}

function filterSummaries(
  summaries: readonly ProjectBoardSummary[],
  tab: BoardsFilterTab,
): readonly ProjectBoardSummary[] {
  if (tab === 'active_sprint') return summaries.filter(row => row.sprintLabel !== undefined)
  if (tab === 'needs_you') return summaries.filter(row => row.needsYouCount > 0)
  return summaries
}

/** Project boards hub. */
export function BoardsHome({
  dict,
  summaries,
  surfaceState = 'ready',
  onOpenProject,
  onNewProject,
  onGlobalView,
}: BoardsHomeProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [tab, setTab] = useState<BoardsFilterTab>('all')
  const visible = useMemo(() => filterSummaries(summaries, tab), [summaries, tab])

  const header = (
    <ScreenHeader
      icon="kanban"
      eyebrow={t('header.eyebrow')}
      title={t('title.boards')}
      subtitle={t('subtitle.boards')}
      actions={(
        <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={() => onNewProject?.()}>
          {t('boards.newProject')}
        </Button>
      )}
    />
  )

  if (surfaceState === 'loading') {
    return (
      <Screen width="full" className={styles.shell} data-persona-boards data-persona-surface="boards" aria-busy="true">
        {header}
        <div className={styles.grid}>
          {[0, 1, 2].map(index => (
            <Skeleton key={index} shape="block" height={190} className={styles.skeletonCard} />
          ))}
        </div>
      </Screen>
    )
  }

  if (surfaceState === 'empty' || summaries.length === 0) {
    return (
      <Screen width="full" className={styles.shell} data-persona-boards data-persona-surface="boards">
        {header}
        <EmptyState
          illustration={ILLUSTRATIONS['empty-kanban']}
          title={t('boards.empty.title')}
          body={t('boards.empty.body')}
          action={(
            <Button variant="primary" icon={<UiIcon name="plus" size={18} strokeWidth={2.2} />} onClick={() => onNewProject?.()}>
              {t('boards.newProject')}
            </Button>
          )}
        />
      </Screen>
    )
  }

  return (
    <Screen width="full" className={styles.shell} data-persona-boards data-persona-surface="boards">
      {header}
      <div className={styles.toolbar}>
        <Tabs
          label={t('title.boards')}
          idPrefix="boards-filter"
          value={tab}
          onChange={(value) => { setTab(value as BoardsFilterTab) }}
          items={[
            { id: 'all', label: t('boards.filter.all') },
            { id: 'active_sprint', label: t('boards.filter.activeSprint') },
            { id: 'needs_you', label: t('boards.filter.needsYou') },
          ]}
        />
        {onGlobalView !== undefined && (
          <Button variant="ghost" onClick={onGlobalView}>{t('boards.globalView')}</Button>
        )}
      </div>
      {visible.length === 0 && (
        <p className={styles.filterEmpty}>{t('boards.filterEmpty')}</p>
      )}
      <div className={styles.grid} role="region" aria-label={t('a11y.boardsGrid')}>
        {visible.map(summary => (
          <ProjectBoardCard key={summary.id} dict={dict} summary={summary} onOpen={onOpenProject} />
        ))}
      </div>
    </Screen>
  )
}

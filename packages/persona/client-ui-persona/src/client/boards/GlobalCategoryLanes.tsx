/** Collapsible lanes per project by category (BOARDS-SPEC §1 visão global). */

import { useState, type ReactNode } from 'react'
import type { KanbanCardModel } from '../kanban/types.ts'
import { ColumnCategoryIcon, FlowIcon } from '../primitives/index.ts'
import { previewTitlesByCategory } from './global-lane-previews.ts'
import type { StageCategory } from './types.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Screen, ScreenHeader } from '../primitives/index.ts'
import styles from './Boards.module.css'
import type { ProjectBoardSummary } from './types.ts'

export interface GlobalCategoryLanesProps {
  readonly dict: LocaleDict
  readonly summaries: readonly ProjectBoardSummary[]
  readonly previewCards?: readonly KanbanCardModel[]
  readonly onBack: () => void
}

const CATEGORY_ORDER: readonly StageCategory[] = ['needs_you', 'doing', 'review', 'todo', 'done']

export function GlobalCategoryLanes({ dict, summaries, previewCards = [], onBack }: GlobalCategoryLanesProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [collapsed, setCollapsed] = useState<Readonly<Record<string, boolean>>>({})

  return (
    <Screen width="full" className={styles.shell} data-persona-boards-global>
      <ScreenHeader
        icon="kanban"
        eyebrow={t('header.eyebrow')}
        title={t('title.global')}
        subtitle={t('subtitle.globalLanes')}
        actions={<Button variant="ghost" onClick={onBack}>{t('boards.backToGrid')}</Button>}
      />
      <div className={styles.lanes}>
        {summaries.map((summary) => {
          const isCollapsed = collapsed[summary.id] === true
          return (
            <Card key={summary.id} padding="s" className={styles.lane}>
              <button
                type="button"
                className={styles.laneHead}
                aria-expanded={!isCollapsed}
                onClick={() => {
                  setCollapsed(prev => ({ ...prev, [summary.id]: !isCollapsed }))
                }}
              >
                <FlowIcon model={summary.flowModel} size={20} />
                <span className={styles.projectName}>{summary.name}</span>
                {summary.needsYouCount > 0 && (
                  <Chip tone="accent" size="s">{t('boards.needsYouChip', { count: summary.needsYouCount })}</Chip>
                )}
              </button>
              {!isCollapsed && (
                <div className={styles.laneColumns}>
                  {CATEGORY_ORDER.map((cat) => {
                    const previews = previewTitlesByCategory(summary.id, previewCards)[cat] ?? []
                    const summaryCount = cat === 'needs_you' ? summary.counts.needs_you : summary.counts[cat]
                    if (summaryCount === 0 && previews.length === 0) return null
                    const count = summaryCount > 0 ? summaryCount : previews.length
                    return (
                      <div key={cat} className={styles.laneMiniCol} data-persona-cat={cat}>
                        <div className={styles.laneMiniHead}>
                          <ColumnCategoryIcon category={cat} size={12} />
                          <Chip tone="neutral" size="s">{t(`category.${cat}`)} · {count}</Chip>
                        </div>
                        {previews.length > 0 && (
                          <ul className={styles.lanePreviewList}>
                            {previews.map(title => (
                              <li key={title}>{title}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </Screen>
  )
}

/** Collapsible lanes per project by category (BOARDS-SPEC §1 visão global). */

import { useState, type ReactNode } from 'react'
import { FlowIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Button, Card, Chip, Screen, ScreenHeader } from '../primitives/index.ts'
import styles from './Boards.module.css'
import type { ProjectBoardSummary } from './types.ts'

export interface GlobalCategoryLanesProps {
  readonly dict: LocaleDict
  readonly summaries: readonly ProjectBoardSummary[]
  readonly onBack: () => void
}

const CATEGORY_ORDER = ['needs_you', 'doing', 'review', 'todo', 'done'] as const

export function GlobalCategoryLanes({ dict, summaries, onBack }: GlobalCategoryLanesProps): ReactNode {
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
                    const count = cat === 'needs_you' ? summary.counts.needs_you : summary.counts[cat]
                    if (count === 0) return null
                    return (
                      <div key={cat} className={styles.laneMiniCol} data-persona-cat={cat}>
                        <Chip tone="neutral" size="s">{t(`category.${cat}`)} · {count}</Chip>
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

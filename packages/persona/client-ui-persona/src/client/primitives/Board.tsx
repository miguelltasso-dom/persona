/**
 * Board primitives for per-project workflows and sprints (BOARDS-SPEC §1–§2, Muse). Presentation only: callers
 * (Lumen) pass already-translated labels and data. Category color is never the only cue — always label + icon.
 */

import type { ReactNode } from 'react'
import { ILLUSTRATIONS } from '../assets/generated-imports.ts'
import { Chip, type ChipTone } from './Chip.tsx'
import { ColumnCategoryIcon, UiIcon } from './icons.tsx'
import styles from './Board.module.css'

export type StageCategory = 'todo' | 'doing' | 'review' | 'needs_you' | 'done' | 'blocked'

const EMPTY_ART: Readonly<Record<StageCategory, string>> = {
  todo: 'empty-col-todo',
  doing: 'empty-col-doing',
  review: 'empty-col-review',
  needs_you: 'empty-col-needs-you',
  done: 'empty-col-done',
  blocked: 'empty-col-blocked',
}

/** data-attribute value for CSS (`needs_you` → `needs-you`). */
function categoryAttr(category: StageCategory): string {
  return category.replace('_', '-')
}

export interface CategoryCount {
  readonly category: StageCategory
  readonly count: number
  /** Translated label, e.g. "a fazer". */
  readonly label: string
}

/** Segmented progress of a project's tasks by stage category + legend of the non-zero ones. */
export function CategoryBar({ counts, label }: { readonly counts: readonly CategoryCount[]; readonly label: string }): ReactNode {
  const total = counts.reduce((sum, row) => sum + row.count, 0)
  const visible = counts.filter(row => row.count > 0)
  return (
    <div className={styles.categoryBar}>
      <div className={styles.track} role="img" aria-label={`${label}: ${visible.map(row => `${row.count} ${row.label}`).join(', ')}`}>
        {total === 0 ? null : visible.map(row => (
          <span
            key={row.category}
            className={styles.segment}
            data-category={categoryAttr(row.category)}
            style={{ flexGrow: row.count }}
          />
        ))}
      </div>
      {visible.length > 0 && (
        <p className={styles.legend} aria-hidden="true">
          {visible.map(row => (
            <span key={row.category} className={styles.legendItem}>
              <span className={styles.dot} data-category={categoryAttr(row.category)} />
              {`${row.count} ${row.label}`}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

export interface BoardColumnProps {
  readonly name: string
  readonly category: StageCategory
  /** Translated category label shown under the name ("Em revisão"). */
  readonly categoryLabel: string
  readonly count: number
  /** Optional WIP limit: chip turns warning at the limit, danger above. */
  readonly wipLimit?: number | undefined
  /** Text under the illustration when the column is empty ("Nada em revisão agora"). */
  readonly emptyLabel: string
  /** Optional action in the empty state (first column: "+ Tarefa"). */
  readonly emptyAction?: ReactNode
  /** Drop target highlight while dragging a card over this column. */
  readonly dropTarget?: boolean | undefined
  /** Header actions (⋯ menu). */
  readonly actions?: ReactNode
  readonly children?: ReactNode
}

/** One workflow column: 4px category stripe, header with count/WIP, body (min 420px), illustrated empty state. */
export function BoardColumn({
  name, category, categoryLabel, count, wipLimit, emptyLabel, emptyAction, dropTarget = false, actions, children,
}: BoardColumnProps): ReactNode {
  const wipTone: ChipTone = wipLimit === undefined ? 'neutral' : count > wipLimit ? 'danger' : count === wipLimit ? 'warning' : 'neutral'
  const art = ILLUSTRATIONS[EMPTY_ART[category]]
  return (
    <section className={styles.column} data-category={categoryAttr(category)} data-drop-target={dropTarget ? '' : undefined} aria-label={`${name} — ${categoryLabel}`}>
      <header className={styles.columnHeader}>
        <div className={styles.columnTitleRow}>
          <span className={styles.columnIcon} aria-hidden="true"><ColumnCategoryIcon category={category} size={14} /></span>
          <h3 className={styles.columnName}>{name}</h3>
          <Chip size="s" tone={wipTone}>{wipLimit === undefined ? count : `${count}/${wipLimit}`}</Chip>
          {actions}
        </div>
        <p className={styles.columnCategory}>{categoryLabel}</p>
      </header>
      <div className={styles.columnBody}>
        {count === 0 ? (
          <div className={styles.columnEmpty}>
            {art !== undefined && <img src={art} alt="" aria-hidden="true" />}
            <p>{emptyLabel}</p>
            {emptyAction}
          </div>
        ) : children}
      </div>
    </section>
  )
}

/** Horizontal scroller for BoardColumns (scroll-snap per column). */
export function BoardColumns({ children, label }: { readonly children: ReactNode; readonly label: string }): ReactNode {
  return <div className={styles.columns} role="region" aria-label={label} tabIndex={0}>{children}</div>
}

export interface SprintStripProps {
  /** "Sprint 3" */
  readonly name: string
  readonly goal: string
  /** "3–14 nov." */
  readonly dateLabel: string
  /** "faltam 4 dias" */
  readonly remainingLabel: string
  readonly remainingTone?: 'neutral' | 'warning' | 'danger'
  readonly done: number
  readonly total: number
  /** "6 de 10 concluídas" */
  readonly progressLabel: string
  readonly actions?: ReactNode
}

/** Current sprint band on top of a project board (BOARDS-SPEC §2.1). */
export function SprintStrip({
  name, goal, dateLabel, remainingLabel, remainingTone = 'neutral', done, total, progressLabel, actions,
}: SprintStripProps): ReactNode {
  const ratio = total === 0 ? 0 : Math.min(1, done / total)
  return (
    <section className={styles.sprint} aria-label={`${name}: ${goal}`}>
      <div className={styles.sprintText}>
        <p className={styles.sprintName}>{name}</p>
        <p className={styles.sprintGoal} title={goal}>{goal}</p>
      </div>
      <div className={styles.sprintMeta}>
        <span className={styles.sprintDates}>{dateLabel}</span>
        <Chip size="s" tone={remainingTone === 'neutral' ? 'brand' : remainingTone} icon={<UiIcon name="clock" size={12} strokeWidth={2.4} />}>
          {remainingLabel}
        </Chip>
      </div>
      <div className={styles.sprintProgress}>
        <div
          className={styles.sprintTrack}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-valuetext={progressLabel}
        >
          <span className={styles.sprintFill} style={{ width: `${ratio * 100}%` }} />
          <span className={styles.sprintPaw} style={{ left: `${ratio * 100}%` }} aria-hidden="true" />
        </div>
        <span className={styles.sprintProgressLabel}>{progressLabel}</span>
      </div>
      {actions !== undefined && <div className={styles.sprintActions}>{actions}</div>}
    </section>
  )
}

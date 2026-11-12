/**
 * Board primitives for per-project workflows and sprints (BOARDS-SPEC §1–§2, Muse). Presentation only: callers
 * (Lumen) pass already-translated labels and data. Category color is never the only cue — always label + icon.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

/** The plain ways to name a stage by its own words, so a column called so does not repeat the stage under its name (pt and en; accents and case do not matter). */
const PLAIN_STAGE_NAMES: Readonly<Record<StageCategory, readonly string[]>> = {
  todo: ['a fazer', 'to do', 'todo', 'backlog'],
  doing: ['fazendo', 'em andamento', 'in progress', 'doing'],
  review: ['em revisao', 'revisao', 'in review', 'review'],
  needs_you: ['precisa de voce', 'needs you'],
  done: ['feito', 'concluido', 'concluida', 'done'],
  blocked: ['bloqueado', 'blocked'],
}

function plainText(text: string): string {
  return text.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Whether a column's name already says its stage ("Fazendo" for the doing stage): then the stage line under the name is a repeat and is not drawn.
 * @param name - The column's name as the person sees it.
 * @param category - The stage the column belongs to.
 * @param categoryLabel - The translated stage label.
 */
export function nameSaysStage(name: string, category: StageCategory, categoryLabel: string): boolean {
  const own = plainText(name)
  return own === plainText(categoryLabel) || PLAIN_STAGE_NAMES[category].includes(own)
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

export interface CategoryBarProgress {
  /** Tasks finished. */
  readonly done: number
  readonly total: number
  /** The same words the screen shows next to the bar ("3 de 8 prontas"). */
  readonly text: string
}

/**
 * Segmented progress of a project's tasks by stage category + legend of the non-zero ones. With `progress` the track is
 * a progressbar whose `aria-valuetext` is the visible sentence plus the category counts; without it, a described image.
 */
export function CategoryBar({ counts, label, progress }: { readonly counts: readonly CategoryCount[]; readonly label: string; readonly progress?: CategoryBarProgress | undefined }): ReactNode {
  const total = counts.reduce((sum, row) => sum + row.count, 0)
  const visible = counts.filter(row => row.count > 0)
  const described = `${label}: ${visible.map(row => `${row.count} ${row.label}`).join(', ')}`
  return (
    <div className={styles.categoryBar}>
      <div
        className={styles.track}
        {...(progress === undefined
          ? { role: 'img', 'aria-label': described }
          : {
            role: 'progressbar',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': progress.total,
            'aria-valuenow': progress.done,
            'aria-valuetext': visible.length === 0 ? progress.text : `${progress.text}. ${visible.map(row => `${row.count} ${row.label}`).join(', ')}`,
          })}
      >
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
  /** Empty state with the words only: a neighbor of the same category already shows the art (never the same picture three times in a row). */
  readonly hideArt?: boolean | undefined
  readonly children?: ReactNode
}

/** One workflow column: 4px category stripe, header with count/WIP, body (min 420px), illustrated empty state. */
export function BoardColumn({
  name, category, categoryLabel, count, wipLimit, emptyLabel, emptyAction, dropTarget = false, actions, hideArt = false, children,
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
        {!nameSaysStage(name, category, categoryLabel) && <p className={styles.columnCategory}>{categoryLabel}</p>}
      </header>
      <div className={styles.columnBody}>
        {count === 0 ? (
          <div className={styles.columnEmpty}>
            {art !== undefined && !hideArt && <img src={art} alt="" aria-hidden="true" />}
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
  const ref = useRef<HTMLDivElement>(null)
  // Where the rail still has columns out of sight: a soft fade on that edge, so a column is never cut like a mistake.
  const [fade, setFade] = useState<'none' | 'start' | 'end' | 'both'>('none')
  const measure = useCallback(() => {
    const node = ref.current
    if (node === null) return
    const start = node.scrollLeft > 4
    const end = node.scrollLeft + node.clientWidth < node.scrollWidth - 4
    setFade(start && end ? 'both' : start ? 'start' : end ? 'end' : 'none')
  }, [])
  useEffect(() => {
    measure()
    const node = ref.current
    if (node === null || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => { observer.disconnect() }
  }, [measure, children])
  return <div ref={ref} className={styles.columns} data-fade={fade} role="region" aria-label={label} tabIndex={0} onScroll={measure}>{children}</div>
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
        {remainingLabel !== '' && (
          <Chip size="s" tone={remainingTone === 'neutral' ? 'brand' : remainingTone} icon={<UiIcon name="clock" size={12} strokeWidth={2.4} />}>
            {remainingLabel}
          </Chip>
        )}
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

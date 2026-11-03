import type { ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import styles from './Boards.module.css'
import type { StageCategory, StageCategoryCounts } from './types.ts'

const SEGMENT_ORDER: readonly StageCategory[] = ['todo', 'doing', 'review', 'needs_you', 'done']

function segmentTotal(counts: StageCategoryCounts): number {
  return SEGMENT_ORDER.reduce((sum, key) => sum + counts[key], 0)
}

export interface CategoryBarProps {
  readonly dict: LocaleDict
  readonly counts: StageCategoryCounts
}

/** Proportional category rail (BOARDS-SPEC §1.3). */
export function CategoryBar({ dict, counts }: CategoryBarProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const total = segmentTotal(counts)
  if (total === 0) {
    return <p className={styles.categoryLegend}>{t('boards.categoryEmpty')}</p>
  }

  const legendParts: string[] = []
  for (const key of SEGMENT_ORDER) {
    const n = counts[key]
    if (n > 0) legendParts.push(t('boards.categoryCount', { category: t(`category.${key}`), count: n }))
  }

  return (
    <div className={styles.categoryBlock}>
      <div className={styles.categoryRail} role="img" aria-label={legendParts.join(', ')}>
        {SEGMENT_ORDER.map((key) => {
          const n = counts[key]
          if (n === 0) return null
          const widthPct = (n / total) * 100
          return (
            <span
              key={key}
              className={styles.categorySegment}
              data-persona-cat={key}
              style={{ flexGrow: n, flexBasis: `${widthPct}%` }}
            />
          )
        })}
      </div>
      <p className={styles.categoryLegend}>{legendParts.join(' · ')}</p>
    </div>
  )
}

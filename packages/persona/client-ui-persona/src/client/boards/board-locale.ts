/** Translated props for Muse board primitives (labels from locale-sources). */

import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { CategoryCount, StageCategory as PrimitiveCategory } from '../primitives/index.ts'
import type { StageCategory, StageCategoryCounts } from './types.ts'

const HUB_BAR_ORDER: readonly PrimitiveCategory[] = ['todo', 'doing', 'review', 'needs_you', 'done']

function countForCategory(counts: StageCategoryCounts, category: PrimitiveCategory): number {
  if (category === 'needs_you') return counts.needs_you
  if (category === 'blocked') return counts.blocked
  return counts[category]
}

/** {@link CategoryBar} on Quadros project tiles (§1). */
export function hubCategoryBarProps(
  dict: LocaleDict,
  counts: StageCategoryCounts,
): { readonly counts: readonly CategoryCount[]; readonly label: string } {
  const t = (key: string) => bindLocale(dict, key)
  const rows: CategoryCount[] = HUB_BAR_ORDER.map(category => ({
    category,
    count: countForCategory(counts, category),
    label: t(`category.${category}`),
  }))
  return { counts: rows, label: t('a11y.categoryBar') }
}

function toPrimitiveCategory(category: StageCategory): PrimitiveCategory {
  if (category === 'blocked') return 'blocked'
  return category
}

/** Column header category line (§2.2). */
export function columnCategoryHeaderLabel(dict: LocaleDict, category: StageCategory): string {
  const t = (key: string) => bindLocale(dict, key)
  if (category === 'todo') return t('column.todo')
  if (category === 'doing') return t('column.inProgress')
  if (category === 'review') return t('column.inReview')
  if (category === 'needs_you') return t('column.needsYou')
  if (category === 'done') return t('column.done')
  return t('category.blocked')
}

/** Illustrated empty copy per category (Brush `empty-col-*`). */
export function columnEmptyLabel(dict: LocaleDict, category: StageCategory): string {
  const key = `empty.column.${category}`
  if (dict[key] !== undefined) return dict[key]
  return bindLocale(dict, 'empty.column')
}

export { toPrimitiveCategory }

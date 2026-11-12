/**
 * Item 22 (colheita): how the sidebar lists the channels of a project: no-category channels first with no header, then one section per
 * category, in the order the person arranged them. Pure: the screen (Muse's design) draws the sections this returns, and keeps for each
 * person which sections are open (that is the person's own state, never stored here).
 *
 * The rules are ours, written from the idea of "named sections that open and close":
 *   1. Channels with no category (or whose category no longer exists) come first, with no header.
 *   2. Categories read by `position`, then by name (pt-BR, accents and case ignored); channels inside a category by `position`, then name.
 *   3. Archived channels are not listed.
 *   4. A category with no channel to show is hidden, unless `showEmptyCategories` (whoever arranges the sidebar needs it to drop channels in).
 *   5. A category name has 1 to 40 characters and is unique ignoring case and accents ({@link checkCategoryName}).
 */

import type { DirectoryCategory, DirectoryChannel } from './channel-directory.ts'

/** Longest category name. */
export const CATEGORY_NAME_MAX = 40

/** One block of the sidebar. `category` is absent for the channels with none (no header). */
export interface LayoutSection {
  readonly category?: DirectoryCategory
  readonly channels: readonly DirectoryChannel[]
}

export interface LayoutInput {
  readonly categories: readonly DirectoryCategory[]
  readonly channels: readonly DirectoryChannel[]
  /** Show a category with no channel (default false). */
  readonly showEmptyCategories?: boolean
  /** Keep only the channels this returns true for (the ones the person may see); default all. */
  readonly visible?: (channel: DirectoryChannel) => boolean
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' })

const byPositionThenName = <T extends { readonly name: string; readonly position?: number }>(a: T, b: T): number =>
  (a.position ?? 0) - (b.position ?? 0) || collator.compare(a.name, b.name)

/**
 * @param input - Categories, channels and who may see what.
 * @returns The sections in the order the sidebar draws them.
 */
export function channelLayoutOf(input: LayoutInput): LayoutSection[] {
  const visible = input.visible ?? (() => true)
  const listed = input.channels.filter(channel => channel.archived !== true && visible(channel))
  const known = new Set(input.categories.map(category => category.id))
  const sections: LayoutSection[] = []
  const loose = listed.filter(channel => channel.categoryId === undefined || !known.has(channel.categoryId)).sort(byPositionThenName)
  if (loose.length > 0) sections.push({ channels: loose })
  for (const category of [...input.categories].sort(byPositionThenName)) {
    const inside = listed.filter(channel => channel.categoryId === category.id).sort(byPositionThenName)
    if (inside.length > 0 || input.showEmptyCategories === true) sections.push({ category, channels: inside })
  }
  return sections
}

export type CategoryNameCheck =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly reason: 'empty' | 'too_long' | 'duplicate' }

/**
 * Whether a name may be given to a category. The name is kept as typed (trimmed, inner spaces collapsed).
 * @param name - What the person typed.
 * @param existing - The other categories' names (leave out the category being renamed).
 */
export function checkCategoryName(name: string, existing: readonly string[]): CategoryNameCheck {
  const clean = name.replace(/\s+/gu, ' ').trim()
  if (clean === '') return { ok: false, reason: 'empty' }
  if ([...clean].length > CATEGORY_NAME_MAX) return { ok: false, reason: 'too_long' }
  if (existing.some(other => collator.compare(other.replace(/\s+/gu, ' ').trim(), clean) === 0)) return { ok: false, reason: 'duplicate' }
  return { ok: true, name: clean }
}

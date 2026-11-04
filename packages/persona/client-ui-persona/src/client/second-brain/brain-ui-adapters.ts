import type { BrainGrantView, BrainKindView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { ChangeItem } from '../primitives/Brain.tsx'
import type { BrandIconName } from '../primitives/icons.tsx'

export const BRAIN_KINDS: readonly BrainKindView[] = [
  'company', 'person', 'client', 'project', 'process', 'rule',
  'decision', 'permission', 'tool', 'glossary', 'learning',
]

export function brainKindLabel(dict: LocaleDict, kind: BrainKindView | string): string {
  const key = `pageType.${kind}`
  const text = bindLocale(dict, key)
  return text === key ? kind : text
}

const KIND_BRAND: Readonly<Record<BrainKindView, BrandIconName>> = {
  company: 'empresa',
  person: 'pessoa',
  client: 'cliente',
  project: 'projeto',
  process: 'processo',
  rule: 'regra',
  decision: 'decisao',
  permission: 'permissao',
  tool: 'ferramenta',
  glossary: 'glossario',
  learning: 'aprendizado',
}

export function brainKindBrandIcon(kind: BrainKindView): BrandIconName {
  return KIND_BRAND[kind]
}

export function contradictionSides(
  dict: LocaleDict,
  page: BrainPageView,
): { readonly current: { readonly text: string; readonly source: string }; readonly incoming: { readonly text: string; readonly source: string } } {
  const parts = page.body.split(/\n---+\n/)
  if (parts.length >= 2) {
    return {
      current: {
        text: parts[0]?.trim() ?? pageExcerpt(page.body),
        source: page.sources[0] ?? bindLocale(dict, 'contradiction.currentSource'),
      },
      incoming: {
        text: parts[1]?.trim() ?? bindLocale(dict, 'contradiction.incomingMissing'),
        source: page.sources[1] ?? (page.editorHint.trim() !== '' ? page.editorHint : bindLocale(dict, 'contradiction.incomingSource')),
      },
    }
  }
  return {
    current: { text: pageExcerpt(page.body, 240), source: bindLocale(dict, 'contradiction.currentSource') },
    incoming: {
      text: page.sources[0] ?? bindLocale(dict, 'contradiction.incomingMissing'),
      source: page.editorHint.trim() !== '' ? page.editorHint : bindLocale(dict, 'contradiction.incomingSource'),
    },
  }
}

export function pageConfirmation(
  dict: LocaleDict,
  page: BrainPageView,
  nowMs: number,
): { readonly text: string; readonly stale: boolean } {
  const updated = Date.parse(page.updatedAt)
  const days = Number.isFinite(updated) ? Math.floor((nowMs - updated) / (24 * 60 * 60 * 1000)) : 0
  if (days >= 90) {
    return { text: bindLocale(dict, 'meta.unconfirmed90', { days: String(days) }), stale: true }
  }
  return { text: bindLocale(dict, 'meta.confirmedRecent', { days: String(Math.max(0, days)) }), stale: false }
}

export function pageToChangeItem(
  dict: LocaleDict,
  page: BrainPageView,
  onOpen?: () => void,
): ChangeItem {
  return {
    id: page.id,
    who: page.editorHint.trim() !== '' ? page.editorHint : bindLocale(dict, 'feed.editorPersona'),
    verb: bindLocale(dict, 'feed.verbUpdated'),
    pageTitle: page.title,
    pageType: brainKindLabel(dict, page.kind),
    time: bindLocale(dict, 'feed.timeToday'),
    ...(page.sources[0] !== undefined ? { source: page.sources[0] } : {}),
    ...(onOpen === undefined ? {} : { onOpen }),
  }
}

export function countPagesByKind(pages: readonly BrainPageView[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const page of pages) counts[page.kind] = (counts[page.kind] ?? 0) + 1
  return counts
}

/** Proxy "most used" until use metrics exist: most recently updated. */
export function topBrainPages(pages: readonly BrainPageView[], limit = 5): readonly BrainPageView[] {
  return [...pages]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
}

export function grantIsExpired(grant: BrainGrantView, nowMs: number): boolean {
  if (grant.revokedAt !== undefined) return false
  if (grant.expiresAt === undefined) return false
  return Date.parse(grant.expiresAt) < nowMs
}

export function grantIsActive(grant: BrainGrantView, nowMs: number): boolean {
  return grant.revokedAt === undefined && !grantIsExpired(grant, nowMs)
}

export function pageExcerpt(body: string, max = 120): string {
  const line = body.split('\n').map(row => row.trim()).find(row => row.length > 0) ?? ''
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`
}

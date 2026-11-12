import type { BrainGrantView, BrainKindView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { ChangeItem } from '../primitives/Brain.tsx'
import type { BrandIconName } from '../primitives/icons.tsx'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'

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

function avatarForCharacterKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined
  return AVATAR_96[key as keyof typeof AVATAR_96]
}

function parseEditorHint(hint: string): { readonly kind: 'person' | 'persona'; readonly id: string } | null {
  const match = /^(person|persona):(.+)$/u.exec(hint.trim())
  if (match === null) return null
  return { kind: match[1] as 'person' | 'persona', id: match[2]!.trim() }
}

/** The animal portrait of a persona: by its `avatarRef` (the one it was hired with), else by its name. */
export function personaPortrait(persona: { readonly name: string; readonly avatarRef?: string | undefined }): string | undefined {
  return avatarForCharacterKey(normalizeCharacterId(persona.avatarRef) ?? normalizeCharacterId(persona.name))
}

/**
 * Who signs the automatic updates of the Memória: the persona that holds the librarian role, else whoever does Pesquisa, else Coordenação.
 * No such persona → undefined, and the screen says "Atualização automática da equipe" (a system actor, never a made-up name).
 *
 * @param personas The roster of the team.
 * @returns The name of the persona that keeps the index, or undefined.
 */
export function indexKeeperName(
  personas: readonly { readonly name: string; readonly title?: string | undefined; readonly systemRoles?: readonly string[] | undefined }[],
): string | undefined {
  const holding = (role: string) => personas.find(row => Array.isArray(row.systemRoles) && row.systemRoles.includes(role))
  const research = personas.find(row => /^pesquisa/iu.test((row.title ?? '').trim()))
  return (holding('librarian') ?? research ?? holding('coordination'))?.name
}

/** Human label + portrait for ChangeFeed rows (host stores `person:system` / `persona:id`). */
export function feedEditorDisplay(
  dict: LocaleDict,
  page: BrainPageView,
  personaNames: Readonly<Record<string, string>> = {},
  /** `person:<memberId>` → the person's name ("Você" for whoever is looking). */
  memberNames: Readonly<Record<string, string>> = {},
): { readonly who: string; readonly whoAvatar?: string | undefined; readonly whoSystem?: boolean } {
  const hint = page.editorHint.trim()
  if (hint === 'person:system') {
    // The index is kept by whoever holds the librarian role in THIS team (`memberNames.system`); no persona, no name.
    const librarian = memberNames.system
    // Muse: no persona in the role → the librarian is a system actor (book icon), never initials of a nobody.
    if (librarian === undefined) return { who: bindLocale(dict, 'feed.whoLibrarian'), whoAvatar: undefined, whoSystem: true }
    return { who: librarian, whoAvatar: avatarForCharacterKey(normalizeCharacterId(librarian)) }
  }
  const parsed = parseEditorHint(hint)
  if (parsed?.kind === 'person') {
    // A member id is never shown: a name when known, else "someone on the team".
    return { who: memberNames[parsed.id] ?? bindLocale(dict, 'feed.whoMember'), whoAvatar: undefined }
  }
  if (parsed?.kind === 'persona') {
    const name = personaNames[parsed.id] ?? parsed.id
    const characterKey = normalizeCharacterId(parsed.id) ?? normalizeCharacterId(name)
    return { who: name, whoAvatar: avatarForCharacterKey(characterKey) }
  }
  if (hint !== '' && !INTERNAL_ID.test(hint)) {
    return { who: hint, whoAvatar: undefined }
  }
  return { who: bindLocale(dict, 'feed.editorPersona'), whoAvatar: undefined }
}

/** Host source ids → copy for UI (ChangeFeed, page meta). */
export function brainSourceLabel(dict: LocaleDict, source: string): string {
  if (source === 'derived-index') return bindLocale(dict, 'feed.sourceDerivedIndex')
  return source
}

/** `kind:id` of something inside the product (a grant, a member, a page): never worth showing as a source. */
const INTERNAL_ID = /^(?:grant|person|persona|member|page|ticket|approval|routine|hire):\S+$/u

/** A source line a person can read; `undefined` when the source is only an internal id (the line is dropped). */
export function brainSourceDisplay(dict: LocaleDict, source: string): string | undefined {
  if (INTERNAL_ID.test(source.trim())) return undefined
  return brainSourceLabel(dict, source)
}

const SLUG = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u
/** An ACTION slug may carry dots (the host's own verbs: `skill.activate`, `action.send`); a TARGET may not (`notas.md` is a file name, not words). */
const ACTION_SLUG = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/u

function slugWords(slug: string): string {
  return slug.replace(/[-_.]+/gu, ' ')
}

/** A permission's action as a sentence part: a known label, else the slug as plain words ("Reply whatsapp" beats `reply-whatsapp`). */
export function grantActionLabel(dict: LocaleDict, action: string): string {
  const key = `grant.action.${action}`
  const known = bindLocale(dict, key)
  if (known !== key) return known
  if (!ACTION_SLUG.test(action)) return action
  // Ember 12:34: a verb the dictionary does not know never reads as loose English ("Send invoice"): it says it is an action and keeps the words in parentheses.
  return bindLocale(dict, 'grant.action.unknown', { name: slugWords(action) })
}

export function grantTargetLabel(dict: LocaleDict, target: string): string {
  const key = `grant.target.${target}`
  const known = bindLocale(dict, key)
  if (known !== key) return known
  // Ember 12:34: a target is never a URL on the screen (an account connector id is its proxy URL WITH THE KEY inside), and an opaque `skill:<id>` / `vault:<id>` says what it is.
  if (target.includes('://')) return bindLocale(dict, 'grant.target.service')
  const kind = /^(skill|vault):/u.exec(target)?.[1]
  if (kind !== undefined) return bindLocale(dict, `grant.target.${kind}`)
  return SLUG.test(target) ? slugWords(target) : target
}

/** "Usada 1 vez" / "Usada 3 vezes": the singular is its own sentence (Ember 12:34: "Usada 1 vezes"). */
export function grantUsageLabel(dict: LocaleDict, count: number): string {
  return count === 1 ? bindLocale(dict, 'permissions.usageOne') : bindLocale(dict, 'permissions.usage', { count })
}

/** The page's title for people: a permission page is titled `action · target` by the host. */
export function brainPageTitle(dict: LocaleDict, page: BrainPageView): string {
  if (page.kind !== 'permission') return page.title
  const [action, target] = page.title.split(' · ').map(part => part.trim())
  if (action === undefined || !ACTION_SLUG.test(action)) return page.title
  const head = grantActionLabel(dict, action)
  return target === undefined || target === '' ? head : `${head}: ${grantTargetLabel(dict, target)}`
}

/** The first lines of a page, without its own title, list marks or [[links]]: the start of what it says. */
export function pageLead(body: string, lines = 2, max = 140): string {
  const rows: string[] = []
  for (const raw of body.split('\n')) {
    const row = raw.trim()
    if (row === '' || row.startsWith('#') || row.startsWith('```') || row === '---') continue
    const clean = row.replace(/^[-*+]\s+/u, '').replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/gu, '$1').trim()
    if (clean === '') continue
    rows.push(clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`)
    if (rows.length >= lines) break
  }
  return rows.join('\n')
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
        source: (page.sources[0] !== undefined ? brainSourceDisplay(dict, page.sources[0]) : undefined) ?? bindLocale(dict, 'contradiction.currentSource'),
      },
      incoming: {
        text: parts[1]?.trim() ?? bindLocale(dict, 'contradiction.incomingMissing'),
        source: (page.sources[1] !== undefined ? brainSourceDisplay(dict, page.sources[1]) : undefined)
          ?? (page.editorHint.trim() !== '' ? feedEditorDisplay(dict, page).who : bindLocale(dict, 'contradiction.incomingSource')),
      },
    }
  }
  return {
    current: { text: pageExcerpt(page.body, 240), source: bindLocale(dict, 'contradiction.currentSource') },
    incoming: {
      text: (page.sources[0] !== undefined ? brainSourceDisplay(dict, page.sources[0]) : undefined) ?? bindLocale(dict, 'contradiction.incomingMissing'),
      source: page.editorHint.trim() !== '' ? feedEditorDisplay(dict, page).who : bindLocale(dict, 'contradiction.incomingSource'),
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
  personaNames: Readonly<Record<string, string>> = {},
  onOpen?: () => void,
  memberNames: Readonly<Record<string, string>> = {},
): ChangeItem {
  const editor = feedEditorDisplay(dict, page, personaNames, memberNames)
  // The automatic index is already "A equipe atualizou …": its source line ("atualizado sozinho") would only repeat it.
  const source = page.sources[0] === undefined || page.sources[0] === 'derived-index' ? undefined : brainSourceDisplay(dict, page.sources[0])
  return {
    id: page.id,
    who: editor.who,
    ...(editor.whoAvatar === undefined ? {} : { whoAvatar: editor.whoAvatar }),
    ...(editor.whoSystem === true ? { whoSystem: true } : {}),
    verb: bindLocale(dict, 'feed.verbUpdated'),
    pageTitle: brainPageTitle(dict, page),
    pageType: brainKindLabel(dict, page.kind),
    time: bindLocale(dict, 'feed.timeToday'),
    ...(source === undefined ? {} : { source }),
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

/**
 * Item 26 (Ferramentas do seu negócio): what the screen reads of the host's catalog and health lines. Pure: no React, no host import.
 * The host decides `promised` ("can be connected today") and `linked` ("the team already has it"); the screen never decides either.
 */

export type ToolCategory = 'sales' | 'payments' | 'support' | 'agenda' | 'documents' | 'social' | 'management'
export type ToolVia = 'claude-account' | 'official' | 'token' | 'unconfirmed'
export type ToolHealthState = 'ok' | 'reconnect' | 'offline' | 'permission' | 'missing'

/** One card of the host's catalog (`getConnectorCatalog`). */
export interface ToolCard {
  readonly id: string
  readonly name: string
  readonly category: ToolCategory
  /** What the team does with it, in plain Portuguese. */
  readonly sentence: string
  readonly via: ToolVia
  readonly promised: boolean
  readonly linked: boolean
}

export interface ToolCatalog {
  readonly categories: readonly { readonly id: ToolCategory; readonly name: string }[]
  readonly cards: readonly ToolCard[]
}

/** One health line of the host (`getConnectorHealth`): a connector of a persona, or a token provider. */
export interface ToolHealthLine {
  readonly id: string
  readonly name: string
  readonly personaId?: string | undefined
  readonly state: ToolHealthState
  readonly action: 'none' | 'reconnect' | 'retry' | 'remove'
  /** The host's own plain-Portuguese sentence (never the provider's raw text). */
  readonly sentence: string
}

/** A connected tool with how it is doing. */
export interface LinkedTool {
  readonly card: ToolCard
  readonly state: ToolHealthState
  readonly sentence: string
  readonly action: ToolHealthLine['action']
}

/** From worst to best: one tool shows the line that needs the person the most. */
const SEVERITY: readonly ToolHealthState[] = ['reconnect', 'permission', 'offline', 'missing', 'ok']

const fold = (value: string): string => value.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, ' ').trim()

/** The same matching the host uses for `linked`: one name contains the other, ignoring case and accents. */
export function sameTool(a: string, b: string): boolean {
  const left = fold(a)
  const right = fold(b)
  return left !== '' && right !== '' && (left.includes(right) || right.includes(left))
}

/**
 * The connected tools, each with the worst health line that mentions it ("Funcionando" when none does).
 * @param catalog - The host's catalog.
 * @param health - The host's health lines.
 */
export function linkedToolsOf(catalog: ToolCatalog, health: readonly ToolHealthLine[]): readonly LinkedTool[] {
  return catalog.cards.filter(card => card.linked).map((card) => {
    const mine = health.filter(line => sameTool(line.name, card.name))
    const worst = [...mine].sort((a, b) => SEVERITY.indexOf(a.state) - SEVERITY.indexOf(b.state))[0]
    return worst === undefined
      ? { card, state: 'ok' as const, sentence: '', action: 'none' as const }
      : { card, state: worst.state, sentence: worst.sentence, action: worst.action }
  })
}

export type ToolFilter = 'all' | ToolCategory

/**
 * The grid under the filter: what the person can connect today (`ready`, "Para ligar") and everything else that is not on yet (`soon`, "Em breve"), never mixed.
 * A tool already connected is NOT here (it is in "Ligadas"). A card is `ready` only when the host says it is connectable (`promised`) AND this build has a way to
 * connect it (`canConnect`): a card with nothing to press goes to "Em breve", never a dead button (Keel/Muse 12/11).
 * @param catalog - The host's catalog.
 * @param filter - The category chip.
 * @param canConnect - Whether the screen has a way to connect this card now (a handler for its `via`). Defaults to "no".
 */
export function gridOf(
  catalog: ToolCatalog,
  filter: ToolFilter,
  canConnect: (card: ToolCard) => boolean = () => false,
): { readonly ready: readonly ToolCard[]; readonly soon: readonly ToolCard[] } {
  const open = catalog.cards.filter(card => !card.linked && (filter === 'all' || card.category === filter))
  const ready = open.filter(card => card.promised && canConnect(card))
  return { ready, soon: open.filter(card => !ready.includes(card)) }
}

/** How many tools each chip holds (the number after its label): the ones still to connect, the same the grid shows under that chip. */
export function countsOf(catalog: ToolCatalog): Readonly<Record<ToolFilter, number>> {
  const open = catalog.cards.filter(card => !card.linked)
  const counts: Record<string, number> = { all: open.length }
  for (const category of catalog.categories) counts[category.id] = open.filter(card => card.category === category.id).length
  return counts as Record<ToolFilter, number>
}

/** The Brush's art of a category (`ILLUSTRATIONS['categoria-<name>-96']`, approved by Muse): never a third party's logo. */
export const CATEGORY_ART: Readonly<Record<ToolCategory, string>> = {
  sales: 'vendas', payments: 'pagamentos', support: 'atendimento', agenda: 'agenda-email', documents: 'documentos', social: 'redes-sociais', management: 'gestao',
}

/** The glyph of a category while its art is not in the build: a plain line icon, never a third party's logo. */
export const CATEGORY_GLYPH: Readonly<Record<ToolCategory, 'estoque' | 'boletos' | 'clientes' | 'agenda' | 'fileText' | 'smile' | 'vendas'>> = {
  sales: 'estoque', payments: 'boletos', support: 'clientes', agenda: 'agenda', documents: 'fileText', social: 'smile', management: 'vendas',
}

const TOOL_CATEGORIES: readonly string[] = ['sales', 'payments', 'support', 'agenda', 'documents', 'social', 'management']
const TOOL_VIAS: readonly string[] = ['claude-account', 'official', 'token', 'unconfirmed']
const TOOL_STATES: readonly string[] = ['ok', 'reconnect', 'offline', 'permission', 'missing']

/** What the screen accepts from the wire: a card with the fields it needs, everything else is dropped (an older or newer host must not break the screen). */
export function readCatalog(raw: unknown): ToolCatalog | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const row = raw as { categories?: unknown; cards?: unknown }
  if (!Array.isArray(row.categories) || !Array.isArray(row.cards)) return undefined
  const categories = (row.categories as unknown[]).flatMap((item) => {
    const entry = item as { id?: unknown; name?: unknown }
    return typeof entry.id === 'string' && TOOL_CATEGORIES.includes(entry.id) && typeof entry.name === 'string' ? [{ id: entry.id as ToolCategory, name: entry.name }] : []
  })
  const cards = (row.cards as unknown[]).flatMap((item) => {
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.sentence !== 'string') return []
    if (typeof entry.category !== 'string' || !TOOL_CATEGORIES.includes(entry.category) || typeof entry.via !== 'string' || !TOOL_VIAS.includes(entry.via)) return []
    return [{
      id: entry.id, name: entry.name, category: entry.category as ToolCategory, sentence: entry.sentence, via: entry.via as ToolVia,
      promised: entry.promised === true, linked: entry.linked === true,
    }]
  })
  return { categories, cards }
}

export function readHealth(raw: unknown): readonly ToolHealthLine[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).flatMap((item) => {
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.state !== 'string' || !TOOL_STATES.includes(entry.state)) return []
    const action = entry.action === 'reconnect' || entry.action === 'retry' || entry.action === 'remove' ? entry.action : 'none'
    return [{
      id: entry.id, name: entry.name, state: entry.state as ToolHealthState, action, sentence: typeof entry.sentence === 'string' ? entry.sentence : '',
      ...(typeof entry.personaId === 'string' ? { personaId: entry.personaId } : {}),
    }]
  })
}

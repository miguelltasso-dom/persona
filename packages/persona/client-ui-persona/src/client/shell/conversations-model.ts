/**
 * CV-1 (CONVERSAS-SPEC §0, barra lilás única): o modelo PURO da parte que rola da barra: Canais e Pessoas.
 * Sem React e sem host: recebe canais e pessoas já prontos e devolve o que a barra desenha, na ordem em que desenha.
 *
 * Regras (Muse):
 *  - até 8 pessoas: todas, em linhas completas (rosto 32, última linha, hora ou não lidas);
 *  - mais de 8: "Todas as personas · {n}" por equipe, recolhíveis (4 rostos empilhados quando recolhido); o grupo da equipe da
 *    conversa aberta vem aberto, os outros recolhidos; o que a pessoa abriu ou recolheu fica lembrado (localStorage com try/catch);
 *  - ORDEM ESTÁVEL (DESIGN-01-MUSE §5.1 #06): a ordem em que as pessoas chegam (Coordenação primeiro, depois a do host) é a ordem do rail
 *    em qualquer estado: nunca se reordena por atividade (a recência vive no Ctrl+K › Recentes);
 *  - a busca filtra canais e pessoas na hora e mostra uma lista só (sem grupos recolhidos escondendo resultado);
 *  - a ordem do Alt+↑/↓ é a ordem em que as linhas aparecem (as de um grupo recolhido não entram).
 */

import { conversationKey, sameConversation, type ConversationTarget } from './conversation-selection.ts'
import type { RailPersonaState } from './RailTeam.tsx'

/** Quantas pessoas ainda cabem "todas, em linhas completas" (acima disso: grupos por equipe). */
export const PEOPLE_SHOW_ALL_MAX = 8
/** Rostos empilhados num grupo recolhido. */
export const GROUP_FACES_MAX = 4

export interface ConversationPerson {
  /** Id da persona no host. */
  readonly id: string
  readonly name: string
  /** Função (cargo curto): "Coordenação", "Engenharia"… */
  readonly role: string
  /** Chave do retrato (AVATAR_96) quando há arte. */
  readonly characterId?: string | undefined
  readonly state?: RailPersonaState | undefined
  /** Draft files, Janela de silêncio and pause: they narrow `state` into the one vocabulary (`team/persona-state.ts`). */
  readonly draftFiles?: number | undefined
  readonly quiet?: boolean | undefined
  readonly paused?: boolean | undefined
  readonly teamId: string | null
  readonly teamName: string | null
  /** Mensagens não lidas na DM com esta pessoa. */
  readonly unread: number
  /** Última linha da conversa (já em texto curto). */
  readonly lastLine?: string | undefined
  /** Hora/dia da última mensagem, já formatado. */
  readonly timeLabel?: string | undefined
  /** `false` = nunca conversaram ("Começar conversa"). */
  readonly hasConversation: boolean
  /** Posição por atividade, 0 = a conversa mais recente. Só de quem já conversou. */
  readonly recentRank?: number | undefined
}

export interface ConversationChannel {
  readonly id: string
  /** Nome sem o `#` ("geral", "marketing"). */
  readonly name: string
  /** Nota curta opcional ("gestores"). */
  readonly note?: string | undefined
  /** Equipe a que o canal pertence (canal de equipe, CV-6): abre o grupo dela nas Pessoas. */
  readonly teamId?: string | null | undefined
  readonly unread: number
}

export interface PeopleGroup {
  /** Chave estável do grupo, usada no `localStorage` e como `key`. */
  readonly key: string
  readonly teamId: string | null
  /** `null` = pessoas sem equipe no organograma. */
  readonly teamName: string | null
  readonly people: readonly ConversationPerson[]
  readonly unread: number
  readonly collapsed: boolean
  /** Os primeiros rostos, para empilhar quando recolhido. */
  readonly faces: readonly ConversationPerson[]
}

export type PeopleSection =
  | { readonly mode: 'all'; readonly people: readonly ConversationPerson[] }
  | { readonly mode: 'grouped'; readonly groups: readonly PeopleGroup[]; readonly total: number }
  | { readonly mode: 'search'; readonly people: readonly ConversationPerson[] }

export interface ConversationsModel {
  readonly channels: readonly ConversationChannel[]
  readonly people: PeopleSection
  /** Alvos na ordem em que as linhas aparecem: é o que o Alt+↑/↓ percorre. */
  readonly order: readonly ConversationTarget[]
  /** `true` quando a busca não achou nada (canais e pessoas). */
  readonly noResults: boolean
}

export interface BuildConversationsInput {
  readonly channels: readonly ConversationChannel[]
  readonly people: readonly ConversationPerson[]
  /** O que a pessoa digitou na busca ("" = sem busca). */
  readonly query: string
  /** Grupos que a pessoa abriu (`false`) ou recolheu (`true`); o que faltar usa o padrão. */
  readonly collapsed: Readonly<Record<string, boolean>>
  /** A conversa aberta agora: o grupo da equipe dela vem aberto por padrão. */
  readonly active: ConversationTarget | null
}

const NO_TEAM_KEY = 'team:_none'

/** Chave estável do grupo de uma equipe. */
export function teamGroupKey(teamId: string | null): string {
  return teamId === null ? NO_TEAM_KEY : `team:${teamId}`
}

/** Minúsculas, sem acento, sem espaço sobrando: "Nína " casa com "nina". */
export function normalizeQuery(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function matchesPerson(person: ConversationPerson, needle: string): boolean {
  return [person.name, person.role, person.teamName ?? ''].some(field => normalizeQuery(field).includes(needle))
}

function matchesChannel(channel: ConversationChannel, needle: string): boolean {
  return [channel.name, channel.note ?? ''].some(field => normalizeQuery(field).includes(needle))
}

/** Quem já conversou primeiro, pela atividade (0 = a mais recente); quem nunca conversou depois, na ordem recebida. */
function byActivity(people: readonly ConversationPerson[]): readonly ConversationPerson[] {
  const talked = people
    .filter(person => person.hasConversation)
    .sort((a, b) => (a.recentRank ?? Number.MAX_SAFE_INTEGER) - (b.recentRank ?? Number.MAX_SAFE_INTEGER))
  const waiting = people.filter(person => !person.hasConversation)
  return [...talked, ...waiting]
}

function personTarget(person: ConversationPerson): ConversationTarget {
  return { kind: 'dm', personaId: person.id }
}

function channelTarget(channel: ConversationChannel): ConversationTarget {
  return { kind: 'channel', id: channel.id }
}

/** A equipe da conversa aberta (pessoa ou canal de equipe): o grupo dela vem aberto por padrão. */
function activeTeamId(input: BuildConversationsInput): string | null {
  const { active } = input
  if (active === null) return null
  if (active.kind === 'dm') return input.people.find(person => person.id === active.personaId)?.teamId ?? null
  return input.channels.find(channel => channel.id === active.id)?.teamId ?? null
}

function groupPeople(input: BuildConversationsInput, people: readonly ConversationPerson[]): readonly PeopleGroup[] {
  const openTeam = activeTeamId(input)
  const byTeam = new Map<string, { teamId: string | null; teamName: string | null; people: ConversationPerson[] }>()
  for (const person of people) {
    const key = teamGroupKey(person.teamId)
    const group = byTeam.get(key) ?? { teamId: person.teamId, teamName: person.teamName, people: [] }
    group.people.push(person)
    byTeam.set(key, group)
  }
  // ORDEM ESTÁVEL (DESIGN-01-MUSE §5.1 #06 cond. 4): as pessoas ficam na ordem em que chegam (Coordenação primeiro, depois a ordem do host),
  // e as equipes na ordem em que cada uma aparece pela primeira vez: nada se reordena por atividade nem por nome.
  return [...byTeam.entries()].map(([key, group]): PeopleGroup => {
    const remembered = input.collapsed[key]
    const collapsed = remembered ?? !(openTeam !== null && group.teamId === openTeam)
    return {
      key,
      teamId: group.teamId,
      teamName: group.teamName,
      people: group.people,
      unread: group.people.reduce((sum, person) => sum + person.unread, 0),
      collapsed,
      faces: group.people.slice(0, GROUP_FACES_MAX),
    }
  })
}

/** Junta tudo: o que a barra desenha e a ordem do teclado. */
export function buildConversationsModel(input: BuildConversationsInput): ConversationsModel {
  const needle = normalizeQuery(input.query)
  const searching = needle.length > 0

  if (searching) {
    const channels = input.channels.filter(channel => matchesChannel(channel, needle))
    const people = byActivity(input.people.filter(person => matchesPerson(person, needle)))
    return {
      channels,
      people: { mode: 'search', people },
      order: [...channels.map(channelTarget), ...people.map(personTarget)],
      noResults: channels.length === 0 && people.length === 0,
    }
  }

  const channels = input.channels
  if (input.people.length <= PEOPLE_SHOW_ALL_MAX) {
    const people = input.people
    return {
      channels,
      people: { mode: 'all', people },
      order: [...channels.map(channelTarget), ...people.map(personTarget)],
      noResults: false,
    }
  }

  const groups = groupPeople(input, input.people)
  const seen = new Set<string>()
  const order: ConversationTarget[] = []
  const push = (target: ConversationTarget): void => {
    const key = conversationKey(target)
    if (seen.has(key)) return
    seen.add(key)
    order.push(target)
  }
  channels.forEach((channel) => { push(channelTarget(channel)) })
  for (const group of groups) {
    if (group.collapsed) continue
    group.people.forEach((person) => { push(personTarget(person)) })
  }
  return {
    channels,
    people: { mode: 'grouped', groups, total: input.people.length },
    order,
    noResults: false,
  }
}

/**
 * Alt+↑/↓: a conversa anterior (`-1`) ou a próxima (`1`) na ordem da barra. Sem conversa aberta (ou fora da lista),
 * ↓ vai para a primeira e ↑ para a última. Nas pontas dá a volta. Lista vazia: `null`.
 */
export function stepConversation(
  order: readonly ConversationTarget[],
  current: ConversationTarget | null,
  direction: 1 | -1,
): ConversationTarget | null {
  if (order.length === 0) return null
  const index = order.findIndex(target => sameConversation(target, current))
  if (index === -1) return direction === 1 ? (order[0] ?? null) : (order[order.length - 1] ?? null)
  return order[(index + direction + order.length) % order.length] ?? null
}

/** Total de não lidas (canais e pessoas), para o selo do trilho. */
export function totalUnread(model: ConversationsModel): number {
  const channels = model.channels.reduce((sum, channel) => sum + channel.unread, 0)
  const people = model.people.mode === 'grouped'
    ? model.people.groups.reduce((sum, group) => sum + group.unread, 0)
    : model.people.people.reduce((sum, person) => sum + person.unread, 0)
  return channels + people
}

// --- o que a pessoa abriu ou recolheu fica lembrado -------------------------------------------------------------

export const CONVERSATION_GROUPS_KEY = 'persona.rail.conversations.groups.v1'

/** Lê os grupos lembrados. Storage bloqueado ou lixo: vazio (nunca lança). */
export function readCollapsedGroups(): Readonly<Record<string, boolean>> {
  try {
    const raw = localStorage.getItem(CONVERSATION_GROUPS_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) if (typeof value === 'boolean') out[key] = value
    return out
  } catch {
    return {}
  }
}

/** Guarda os grupos lembrados. Falha de storage é silenciosa: a barra não depende disto. */
export function writeCollapsedGroups(groups: Readonly<Record<string, boolean>>): void {
  try {
    localStorage.setItem(CONVERSATION_GROUPS_KEY, JSON.stringify(groups))
  } catch {
    /* cheio ou bloqueado: sem lembrança */
  }
}

/** Recolhe ou abre um grupo, devolvendo o novo mapa (não muta). */
export function toggleGroup(groups: Readonly<Record<string, boolean>>, key: string, currentlyCollapsed: boolean): Readonly<Record<string, boolean>> {
  return { ...groups, [key]: !currentlyCollapsed }
}

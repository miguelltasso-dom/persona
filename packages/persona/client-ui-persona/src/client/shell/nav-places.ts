/**
 * A-1 (NAV-SPEC): seis lugares no rail; as telas de hoje viram abas dentro do lugar.
 * As rotas NÃO mudam: cada aba é um `MainPanelId` que já existe. O Ctrl K continua achando pelos nomes antigos.
 */

import type { BrandIconName } from '../primitives/index.ts'
import type { ShellKey } from '../locale/shell/locales.ts'
import type { MainPanelId } from './create-shell-store.ts'

export type PlaceId = 'overview' | 'conversations' | 'projects' | 'approvals' | 'team' | 'memory' | 'settings'

export interface NavTab {
  readonly panel: MainPanelId
  readonly labelKey: ShellKey
}

export interface NavPlace {
  readonly id: PlaceId
  readonly labelKey: ShellKey
  readonly icon: BrandIconName
  /** Abas do lugar (um lugar de uma tela só não tem barra de abas). A primeira é a entrada padrão. */
  readonly tabs: readonly NavTab[]
}

/** Os lugares, na ordem; "Configurações" mora no rodapé do rail, com as mesmas abas. */
export const NAV_PLACES: readonly NavPlace[] = [
  {
    id: 'overview',
    labelKey: 'sidebar.overview',
    icon: 'visao-geral',
    tabs: [{ panel: 'overview', labelKey: 'sidebar.overview' }],
  },
  {
    id: 'conversations',
    labelKey: 'place.conversations',
    icon: 'canais',
    tabs: [
      { panel: 'channels', labelKey: 'sidebar.channels' },
      { panel: 'directMessages', labelKey: 'sidebar.directMessages' },
    ],
  },
  {
    id: 'projects',
    labelKey: 'sidebar.projects',
    icon: 'projetos',
    // Ponte até a fase 2 (Projetos × Quadros numa tela só): nenhuma tela some, todas seguem a 1 clique.
    tabs: [
      { panel: 'projects', labelKey: 'sidebar.projects' },
      { panel: 'kanban', labelKey: 'sidebar.kanban' },
      { panel: 'routines', labelKey: 'sidebar.routines' },
      { panel: 'files', labelKey: 'sidebar.files' },
      { panel: 'canvas', labelKey: 'sidebar.canvas' },
    ],
  },
  {
    id: 'approvals',
    labelKey: 'sidebar.approvals',
    icon: 'decisoes',
    tabs: [{ panel: 'approvals', labelKey: 'sidebar.approvals' }],
  },
  {
    id: 'team',
    labelKey: 'place.team',
    icon: 'equipe',
    tabs: [
      { panel: 'team', labelKey: 'tab.team' },
      { panel: 'orgChart', labelKey: 'sidebar.orgChart' },
      { panel: 'teamHealth', labelKey: 'sidebar.teamHealth' },
    ],
  },
  {
    id: 'memory',
    labelKey: 'place.memory',
    icon: 'conhecimento-memoria',
    tabs: [
      { panel: 'secondBrain', labelKey: 'sidebar.secondBrain' },
      { panel: 'knowledge', labelKey: 'sidebar.knowledge' },
      { panel: 'rules', labelKey: 'sidebar.rules' },
    ],
  },
  {
    id: 'settings',
    labelKey: 'place.settings',
    icon: 'configuracoes',
    tabs: [
      { panel: 'connections', labelKey: 'sidebar.connections' },
      { panel: 'usage', labelKey: 'sidebar.usage' },
      { panel: 'members', labelKey: 'tab.settings.members' },
      { panel: 'importers', labelKey: 'sidebar.importers' },
      { panel: 'about', labelKey: 'tab.settings.about' },
    ],
  },
]

/** Os lugares que ficam no topo do rail ("Configurações" vai para o rodapé). */
export const RAIL_PLACES: readonly NavPlace[] = NAV_PLACES.filter(place => place.id !== 'settings')

/** O lugar a que uma tela pertence (ajuda, busca e perfil não são lugares). */
export function placeOfPanel(panel: MainPanelId): NavPlace | undefined {
  return NAV_PLACES.find(place => place.tabs.some(tab => tab.panel === panel))
}

/** Os ids de painel que algum lugar alcança: tudo o que existia no rail continua a 1 clique de alguma aba. */
export function panelsReachableFromPlaces(): readonly MainPanelId[] {
  return NAV_PLACES.flatMap(place => place.tabs.map(tab => tab.panel))
}

/**
 * Nomes antigos que o Ctrl K continua entendendo (NAV-SPEC regra 3): "Quadros", "Kanban", "Canvas", "Saúde",
 * "Cofre", "Conexões", "Membros"… levam à aba certa. Sem acento e em minúsculas; use {@link resolvePlaceAlias}.
 */
export const PLACE_ALIASES: readonly { readonly alias: string; readonly panel: MainPanelId }[] = [
  { alias: 'quadros', panel: 'kanban' },
  { alias: 'quadro', panel: 'kanban' },
  { alias: 'kanban', panel: 'kanban' },
  { alias: 'tarefas', panel: 'kanban' },
  { alias: 'canvas', panel: 'canvas' },
  { alias: 'mapa', panel: 'canvas' },
  { alias: 'saude', panel: 'teamHealth' },
  { alias: 'saude da equipe', panel: 'teamHealth' },
  { alias: 'quem cuida de quem', panel: 'orgChart' },
  { alias: 'organograma', panel: 'orgChart' },
  { alias: 'cofre', panel: 'connections' },
  { alias: 'conexoes', panel: 'connections' },
  { alias: 'membros', panel: 'members' },
  { alias: 'equipe remota', panel: 'members' },
  { alias: 'uso', panel: 'usage' },
  { alias: 'limites', panel: 'usage' },
  { alias: 'uso e limites', panel: 'usage' },
  { alias: 'importar', panel: 'importers' },
  { alias: 'importadores', panel: 'importers' },
  { alias: 'segundo cerebro', panel: 'secondBrain' },
  { alias: 'conhecimento', panel: 'knowledge' },
  { alias: 'regras', panel: 'rules' },
  { alias: 'rotinas', panel: 'routines' },
  { alias: 'arquivos', panel: 'files' },
  { alias: 'canais', panel: 'channels' },
  { alias: 'mensagens diretas', panel: 'directMessages' },
  { alias: 'dms', panel: 'directMessages' },
]

/** "Saúde", "SAÚDE " e "saude" são a mesma coisa. */
export function normalizeAlias(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase()
}

/** O painel que o nome antigo digitado alcança (igualdade exata, sem acento); `undefined` se não for um apelido. */
export function resolvePlaceAlias(query: string): MainPanelId | undefined {
  const needle = normalizeAlias(query)
  if (needle === '') return undefined
  return PLACE_ALIASES.find(row => row.alias === needle)?.panel
}

const LAST_TAB_PREFIX = 'persona.place.lastTab.'

type TabStorage = Pick<Storage, 'getItem' | 'setItem'>

function defaultStorage(): TabStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

/** A última aba aberta neste lugar (só abas que ainda existem); sem lembrança ou com storage bloqueado, a primeira. */
export function placeEntryPanel(place: NavPlace, storage: TabStorage | undefined = defaultStorage()): MainPanelId {
  const first = place.tabs[0]?.panel ?? 'overview'
  try {
    const saved = storage?.getItem(`${LAST_TAB_PREFIX}${place.id}`)
    if (saved !== null && saved !== undefined && place.tabs.some(tab => tab.panel === saved)) return saved as MainPanelId
  } catch {
    /* storage bloqueado: segue com a primeira aba */
  }
  return first
}

export function rememberPlaceTab(place: NavPlace, panel: MainPanelId, storage: TabStorage | undefined = defaultStorage()): void {
  if (!place.tabs.some(tab => tab.panel === panel)) return
  try {
    storage?.setItem(`${LAST_TAB_PREFIX}${place.id}`, panel)
  } catch {
    /* só um conforto: sem storage, não lembra */
  }
}

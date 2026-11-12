/**
 * A-1 (NAV-SPEC): seis lugares no rail; as telas de hoje viram abas dentro do lugar.
 * As rotas NÃO mudam: cada aba é um `MainPanelId` que já existe. O Ctrl K continua achando pelos nomes antigos.
 */

import type { BrandIconName } from '../primitives/index.ts'
import type { ShellKey } from '../locale/shell/locales.ts'
import { isSettingsPersonasEnabled } from '../settings-personas/personas-flag.ts'
import { isRemoteTeamTabEnabled } from '../members/members-flag.ts'
import type { MainPanelId } from './create-shell-store.ts'

export type PlaceId = 'overview' | 'projects' | 'approvals' | 'team' | 'memory' | 'settings'

export interface NavTab {
  readonly panel: MainPanelId
  readonly labelKey: ShellKey
  /**
   * A tela pertence ao lugar (o Ctrl K e os atalhos a alcançam) mas não é aba da barra: a grade "Ver todos os projetos" não é de um projeto,
   * então não tem as abas Quadro · Arquivos · Canvas (que são do projeto da vez). Nunca é a entrada do lugar nem a "última aba".
   */
  readonly hidden?: true
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
    id: 'projects',
    labelKey: 'sidebar.projects',
    icon: 'projetos',
    // DESIGN-01 #10 (Muse §5.1): UM lugar que abre no QUADRO do projeto da vez. As abas são desse projeto; a grade de cartões ("Ver todos os
    // projetos") é o painel `projects`, alcançável mas escondido da barra; as rotinas da equipe toda moram em Equipe.
    tabs: [
      { panel: 'kanban', labelKey: 'tab.projects.board' },
      { panel: 'files', labelKey: 'sidebar.files' },
      { panel: 'canvas', labelKey: 'sidebar.canvas' },
      { panel: 'projects', labelKey: 'sidebar.projects', hidden: true },
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
      // As rotinas são da equipe toda (o giro da manhã, o Bom dia): uma aba com o nome de um projeto mostrando isso enganaria (Muse §5.1 #3).
      { panel: 'routines', labelKey: 'sidebar.routines' },
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
      // Cofre (item 15, Muse 12/11): ao lado de Conexões; senha não é memória, então não vai na Memória da empresa.
      { panel: 'cofre', labelKey: 'sidebar.cofre' },
      // Personas (HT-13/EFF-1, D-090): entre Conexões e Uso, só com `persona.flag.settingsPersonas` ligada.
      ...(isSettingsPersonasEnabled() ? [{ panel: 'personas', labelKey: 'tab.settings.personas' } as const] : []),
      { panel: 'usage', labelKey: 'sidebar.usage' },
      // Membros (cena 20): aba só com a equipe remota ligada (flag remoteTeamTab, padrão desligada na v1.1); sem ela, o cartão fica em Conexões.
      ...(isRemoteTeamTabEnabled() ? [{ panel: 'members', labelKey: 'tab.settings.members' } as const] : []),
      // Importadores fica até a aba Importar existir na Memória da empresa (onda 3, Lumen): nenhuma função some antes.
      { panel: 'importers', labelKey: 'sidebar.importers' },
      // Aparência (TH-1 + cena 22): tema, figurinhas (antes a aba Personalidade) e dicas de atalho (APARENCIA-SPEC).
      { panel: 'appearance', labelKey: 'tab.settings.appearance' },
      { panel: 'about', labelKey: 'tab.settings.about' },
    ],
  },
]

/** Os lugares que ficam no topo do rail ("Configurações" vai para o rodapé). */
export const RAIL_PLACES: readonly NavPlace[] = NAV_PLACES.filter(place => place.id !== 'settings')

/** As abas que a barra desenha (as escondidas, como a grade de projetos, ficam de fora). */
export function visibleTabs(place: NavPlace): readonly NavTab[] {
  return place.tabs.filter(tab => tab.hidden !== true)
}

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
  { alias: 'todos os projetos', panel: 'projects' },
  { alias: 'canvas', panel: 'canvas' },
  { alias: 'mapa', panel: 'canvas' },
  { alias: 'saude', panel: 'teamHealth' },
  { alias: 'saude da equipe', panel: 'teamHealth' },
  { alias: 'quem cuida de quem', panel: 'orgChart' },
  { alias: 'organograma', panel: 'orgChart' },
  { alias: 'cofre', panel: 'cofre' },
  { alias: 'conexoes', panel: 'connections' },
  { alias: 'membros', panel: isRemoteTeamTabEnabled() ? 'members' : 'connections' },
  { alias: 'equipe remota', panel: isRemoteTeamTabEnabled() ? 'members' : 'connections' },
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

/** A última aba aberta neste lugar (só abas visíveis que ainda existem); sem lembrança ou com storage bloqueado, a primeira. */
export function placeEntryPanel(place: NavPlace, storage: TabStorage | undefined = defaultStorage()): MainPanelId {
  const tabs = visibleTabs(place)
  const first = tabs[0]?.panel ?? 'overview'
  try {
    const saved = storage?.getItem(`${LAST_TAB_PREFIX}${place.id}`)
    if (saved !== null && saved !== undefined && tabs.some(tab => tab.panel === saved)) return saved as MainPanelId
  } catch {
    /* storage bloqueado: segue com a primeira aba */
  }
  return first
}

export function rememberPlaceTab(place: NavPlace, panel: MainPanelId, storage: TabStorage | undefined = defaultStorage()): void {
  if (!visibleTabs(place).some(tab => tab.panel === panel)) return
  try {
    storage?.setItem(`${LAST_TAB_PREFIX}${place.id}`, panel)
  } catch {
    /* só um conforto: sem storage, não lembra */
  }
}

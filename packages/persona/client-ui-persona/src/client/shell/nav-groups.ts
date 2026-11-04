/** Rail navigation model (Muse): shared by the rail and by Ctrl K / Busca ("Ir para"), so every screen is findable. */

import type { BrandIconName } from '../primitives/index.ts'
import type { ShellKey } from '../locale/shell/locales.ts'
import type { MainPanelId } from './create-shell-store.ts'

/** Window event: Ctrl K asks Busca to focus (and select) its field. */
export const SEARCH_FOCUS_EVENT = 'persona:focus-search'

export interface NavItem {
  readonly panel: MainPanelId
  readonly labelKey: ShellKey
  readonly icon: BrandIconName
}

export interface NavGroup {
  readonly id: string
  readonly labelKey?: ShellKey
  readonly items: readonly NavItem[]
}

/** DESIGN-SYSTEM §6: grouped rail; daily surfaces first, rarely used ones under "Mais". */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'main',
    items: [
      { panel: 'overview', labelKey: 'sidebar.overview', icon: 'visao-geral' },
      { panel: 'channels', labelKey: 'sidebar.channels', icon: 'canais' },
      { panel: 'directMessages', labelKey: 'sidebar.directMessages', icon: 'mensagens-diretas' },
    ],
  },
  {
    id: 'team',
    labelKey: 'sidebar.group.team',
    items: [
      { panel: 'team', labelKey: 'sidebar.team', icon: 'equipe' },
      { panel: 'orgChart', labelKey: 'sidebar.orgChart', icon: 'quem-cuida' },
      { panel: 'teamHealth', labelKey: 'sidebar.teamHealth', icon: 'saude' },
    ],
  },
  {
    id: 'work',
    labelKey: 'sidebar.group.work',
    items: [
      { panel: 'projects', labelKey: 'sidebar.projects', icon: 'projetos' },
      { panel: 'kanban', labelKey: 'sidebar.kanban', icon: 'kanban' },
      { panel: 'routines', labelKey: 'sidebar.routines', icon: 'rotinas' },
      { panel: 'approvals', labelKey: 'sidebar.approvals', icon: 'decisoes' },
    ],
  },
  {
    id: 'company',
    labelKey: 'sidebar.group.company',
    items: [
      { panel: 'knowledge', labelKey: 'sidebar.knowledge', icon: 'conhecimento-memoria' },
      { panel: 'secondBrain', labelKey: 'sidebar.secondBrain', icon: 'conhecimento-memoria' },
      { panel: 'files', labelKey: 'sidebar.files', icon: 'arquivos' },
      { panel: 'rules', labelKey: 'sidebar.rules', icon: 'quadro' },
      { panel: 'connections', labelKey: 'sidebar.connections', icon: 'skills' },
      { panel: 'usage', labelKey: 'sidebar.usage', icon: 'uso-e-limites' },
    ],
  },
  {
    id: 'more',
    labelKey: 'sidebar.group.more',
    items: [
      { panel: 'members', labelKey: 'sidebar.members', icon: 'convidar' },
      { panel: 'importers', labelKey: 'sidebar.importers', icon: 'arquivos' },
      { panel: 'canvas', labelKey: 'sidebar.canvas', icon: 'canvas' },
    ],
  },
]

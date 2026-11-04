/** Real-app gallery targets (pt-BR nav labels match PersonaSidebar). */

export type GalleryOwner = 'Prism' | 'Lumen' | 'Muse'

export interface GalleryPanelSpec {
  readonly slug: string
  readonly navLabel: string
  readonly owner: GalleryOwner
  /** Playwright selector to wait after navigation. */
  readonly readySelector?: string
  readonly kind: 'nav' | 'settings' | 'onboarding-step' | 'unmounted' | 'profile-via-rail'
  readonly onboardingStep?: number
  /** Coordination persona on the rail (dev seed default: Atlas). */
  readonly profileRailPersona?: string
}

/** Dev harness roster coordination name (`SUGGESTED_TEAM_GALLERY`). */
export const DEV_SEED_PROFILE_PERSONA = 'Atlas'

/** Panels exercised by gallery health / blank-panel / axe matrix. */
export function realGalleryHealthPanelSpecs(): readonly GalleryPanelSpec[] {
  return REAL_GALLERY_PANELS.filter(
    p => p.kind === 'nav' || p.kind === 'settings' || p.kind === 'profile-via-rail',
  )
}

export const ONBOARDING_STORAGE_KEY = 'persona.onboarding.complete.v1'

export const REAL_GALLERY_PANELS: readonly GalleryPanelSpec[] = [
  { slug: 'visao-geral', navLabel: 'Visão geral', owner: 'Prism', kind: 'nav' },
  { slug: 'geral', navLabel: 'Canais', owner: 'Prism', kind: 'nav' },
  { slug: 'equipe', navLabel: 'Equipe', owner: 'Prism', kind: 'nav' },
  { slug: 'org-chart', navLabel: 'Quem cuida de quem', owner: 'Lumen', readySelector: '[data-persona-surface="org-chart"]', kind: 'nav' },
  { slug: 'team-health', navLabel: 'Saúde', owner: 'Lumen', readySelector: '[data-persona-surface="team-health"]', kind: 'nav' },
  { slug: 'busca', navLabel: 'Buscar em tudo…', owner: 'Prism', kind: 'nav' },
  { slug: 'projetos', navLabel: 'Projetos', owner: 'Prism', kind: 'nav' },
  { slug: 'kanban', navLabel: 'Quadros', owner: 'Lumen', readySelector: '[data-persona-surface="boards"]', kind: 'nav' },
  { slug: 'rotinas', navLabel: 'Rotinas', owner: 'Lumen', kind: 'nav' },
  { slug: 'canais', navLabel: 'Canais', owner: 'Prism', kind: 'nav' },
  { slug: 'dms', navLabel: 'Mensagens diretas', owner: 'Prism', kind: 'nav' },
  { slug: 'conhecimento', navLabel: 'Conhecimento', owner: 'Lumen', kind: 'nav' },
  {
    slug: 'segundo-cerebro',
    navLabel: 'Segundo cérebro',
    owner: 'Lumen',
    readySelector: '[data-persona-surface="second-brain"]',
    kind: 'nav',
  },
  { slug: 'arquivos', navLabel: 'Arquivos', owner: 'Lumen', kind: 'nav' },
  { slug: 'uso', navLabel: 'Uso e limites', owner: 'Lumen', kind: 'nav' },
  { slug: 'conexoes', navLabel: 'Conexões', owner: 'Lumen', kind: 'nav' },
  { slug: 'aprovacoes', navLabel: 'Aprovações', owner: 'Lumen', readySelector: '[data-persona-surface="approvals"]', kind: 'nav' },
  { slug: 'regras', navLabel: 'Regras', owner: 'Lumen', readySelector: '[data-persona-surface="rules"]', kind: 'nav' },
  {
    slug: 'perfil',
    navLabel: 'Perfil',
    owner: 'Lumen',
    readySelector: '[data-persona-surface="profile"]',
    kind: 'profile-via-rail',
    profileRailPersona: DEV_SEED_PROFILE_PERSONA,
  },
  { slug: 'membros', navLabel: 'Membros', owner: 'Lumen', readySelector: '[data-persona-surface="members"]', kind: 'nav' },
  { slug: 'importar', navLabel: 'Importadores', owner: 'Lumen', readySelector: '[data-persona-surface="importers"]', kind: 'nav' },
  { slug: 'canvas', navLabel: 'Canvas', owner: 'Lumen', readySelector: '[data-persona-surface="canvas"]', kind: 'nav' },
  { slug: 'configuracoes', navLabel: 'Configurações', owner: 'Prism', kind: 'settings' },
  { slug: 'onboarding-passo-1', navLabel: 'Onboarding passo 1', owner: 'Muse', kind: 'onboarding-step', onboardingStep: 1 },
  { slug: 'onboarding-passo-2', navLabel: 'Onboarding passo 2', owner: 'Muse', kind: 'onboarding-step', onboardingStep: 2 },
  { slug: 'onboarding-passo-3', navLabel: 'Onboarding passo 3', owner: 'Muse', kind: 'onboarding-step', onboardingStep: 3 },
  { slug: 'onboarding-passo-4', navLabel: 'Onboarding passo 4', owner: 'Muse', kind: 'onboarding-step', onboardingStep: 4 },
  { slug: 'onboarding-passo-5', navLabel: 'Onboarding passo 5', owner: 'Muse', kind: 'onboarding-step', onboardingStep: 5 },
  { slug: 'editor-persona', navLabel: 'Editor de persona', owner: 'Prism', kind: 'unmounted' },
]

export const GALLERY_VIEWPORTS = [
  { tag: '1280x720', width: 1280, height: 720 },
  { tag: '1920x1080', width: 1920, height: 1080 },
] as const

export const GALLERY_THEMES = ['light', 'dark'] as const

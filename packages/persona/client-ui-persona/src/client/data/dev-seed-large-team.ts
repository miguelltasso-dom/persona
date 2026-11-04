/**
 * Dev/gallery harness: roster seed + large organogram (GOV-6 capture 60/150).
 * Probe/Muse: `applyDevSeedLargeTeam(150)` before navigation; never shipped in production UI.
 */
import { ORG_CHART_SCALE_SEED_KEY } from '../governance/org-scale-dev.ts'
import { KANBAN_SCALE_SEED_KEY } from '../kanban/kanban-scale-dev.ts'
import type { KanbanScaleSeed } from '../kanban/mock-large-kanban-cards.ts'

export const DEV_SEED_STORAGE_KEY = 'persona.devSeed.v1'

export type OrgChartScaleSeed = 60 | 150

/** Writes {@link DEV_SEED_STORAGE_KEY}, {@link ORG_CHART_SCALE_SEED_KEY}, optional {@link KANBAN_SCALE_SEED_KEY}. */
export function applyDevSeedLargeTeam(scale: OrgChartScaleSeed, kanbanScale?: KanbanScaleSeed): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(DEV_SEED_STORAGE_KEY, '1')
  localStorage.setItem(ORG_CHART_SCALE_SEED_KEY, String(scale))
  if (kanbanScale !== undefined) {
    localStorage.setItem(KANBAN_SCALE_SEED_KEY, String(kanbanScale))
  }
}

/** Read back the scale seed when present (for tests). */
export function readDevOrgChartScaleSeed(): OrgChartScaleSeed | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(ORG_CHART_SCALE_SEED_KEY)?.trim()
  if (raw === '60') return 60
  if (raw === '150') return 150
  return null
}

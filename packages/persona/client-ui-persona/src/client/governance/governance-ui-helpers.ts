/** Shared GOV-6/7 UI helpers (Muse review). */

import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { OrgMapLabels } from '../primitives/OrgMap.tsx'
import type { GovernanceFixKind } from './governance-contract.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'

/** Gallery avatar ref → portrait key (RailPersona / AVATAR_96). */
export function normalizeCharacterId(ref: string | undefined): string | undefined {
  if (ref === undefined || ref.trim().length === 0) return undefined
  const trimmed = ref.trim().replace(/-default$/u, '').toLowerCase()
  return trimmed.length > 0 ? trimmed : undefined
}

const SECTOR_BY_TITLE: Readonly<Record<string, string>> = {
  vendas: 'vendas',
  suporte: 'suporte',
  produto: 'produto',
  engenharia: 'engenharia',
  marketing: 'marketing',
  financeiro: 'financeiro',
  operações: 'operacoes',
  operacoes: 'operacoes',
  pessoas: 'pessoas',
  admin: 'admin',
  conteúdo: 'conteudo',
  conteudo: 'conteudo',
  dados: 'dados',
  jurídico: 'juridico',
  juridico: 'juridico',
}

/** Map group title to Brush sector id when possible. */
export function sectorIdFromTitle(title: string): string {
  const key = title.trim().toLowerCase()
  return SECTOR_BY_TITLE[key] ?? key.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/gu, '-')
}

const SLOT_KEYS = ['twoDay.slot1', 'twoDay.slot2', 'twoDay.slot3', 'twoDay.slot4'] as const

export function defaultTwoDaySlotLabels(dict: LocaleDict): readonly string[] {
  const t = (key: string) => bindLocale(dict, key)
  return SLOT_KEYS.map(key => t(key))
}

export function healthFixActionLabel(dict: LocaleDict, fixKind: GovernanceFixKind): string {
  const t = (key: string) => bindLocale(dict, key)
  const key = `health.fix.${fixKind}`
  const label = bindLocale(dict, key)
  return label === key ? t('health.fix') : label
}

export function orgChartPersonasSubtitle(dict: LocaleDict, personas: number): string {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return personas === 1 ? t('org.subtitlePersonasOne') : t('org.subtitlePersonas', { count: personas })
}

export function orgChartHumansSubtitle(dict: LocaleDict, humans: number): string {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return humans === 1 ? t('org.subtitleHumansOne') : t('org.subtitleHumansMany', { count: humans })
}

export function orgMapLabelsFromDict(dict: LocaleDict): OrgMapLabels {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  return {
    search: t('org.map.search'),
    searchPlaceholder: t('org.map.searchPlaceholder'),
    noMatch: t('org.map.noMatch'),
    zoomIn: t('org.map.zoomIn'),
    zoomOut: t('org.map.zoomOut'),
    fit: t('org.map.fit'),
    expandAll: t('org.map.expandAll'),
    collapseAll: t('org.map.collapseAll'),
    minimap: t('org.map.minimap'),
    count: n => (n === 1 ? t('org.map.countOne') : t('org.map.count', { count: n })),
    attention: n => (n === 1 ? t('org.map.attentionOne') : t('org.map.attention', { count: n })),
    expand: g => t('org.map.expand', { group: g }),
    collapse: g => t('org.map.collapse', { group: g }),
    showMore: n => t('org.map.showMore', { count: n }),
    gestor: t('org.map.gestor'),
  }
}

/** Personas with Gestor de equipe (team_manager) — baton on the org chart. */
export function gestorPersonaIdsFromLive(snap: PersonaLiveSnapshot | null): ReadonlySet<string> {
  if (snap?.ready !== true || snap.team === null) return new Set()
  return new Set(
    snap.team.personas
      .filter(row => row.systemRoles.includes('team_manager'))
      .map(row => row.id),
  )
}

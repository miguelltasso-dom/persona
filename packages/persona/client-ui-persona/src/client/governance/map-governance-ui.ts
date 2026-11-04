import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import type { OrgGroup, OrgPersona, OrgPersonaState, TwoDayRow } from '../primitives/Governance.tsx'
import type { GovernanceFixKind, OrgChartView, OrgPersonaStateView, OrgPersonaView, TwoDayRowView, TwoDayTestView } from './governance-contract.ts'
import { defaultTwoDaySlotLabels, healthFixActionLabel, normalizeCharacterId } from './governance-ui-helpers.ts'

function mapState(state: OrgPersonaStateView, t: (key: string) => string): { state: OrgPersonaState; label: string } {
  return { state, label: t(`state.${state}`) }
}

function toOrgPersona(
  row: OrgPersonaView,
  t: (key: string) => string,
  railByPersonaId?: ReadonlyMap<string, string>,
  sector?: string,
  gestorIds?: ReadonlySet<string>,
): OrgPersona {
  const mapped = mapState(row.state, t)
  const fromRow = normalizeCharacterId(row.characterId)
  const fromRail = railByPersonaId === undefined ? undefined : normalizeCharacterId(railByPersonaId.get(row.id))
  const characterId = fromRow ?? fromRail
  const sectorName = row.sector ?? sector
  const gestor = gestorIds?.has(row.id) === true
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    ...(characterId === undefined ? {} : { characterId }),
    ...(sectorName === undefined ? {} : { sector: sectorName }),
    state: mapped.state,
    stateLabel: mapped.label,
    ...(gestor ? { gestor: true as const, gestorLabel: t('org.map.gestor') } : {}),
  }
}

export interface OrgChartUiModel {
  readonly root?: OrgPersona & { caption: string }
  readonly groups: readonly (OrgGroup & { away?: boolean })[]
  readonly personaCount: number
  readonly humanCount: number
}

export function orgChartToUi(
  dict: LocaleDict,
  view: OrgChartView,
  railByPersonaId?: ReadonlyMap<string, string>,
  gestorIds?: ReadonlySet<string>,
): OrgChartUiModel {
  const t = (key: string) => bindLocale(dict, key)
  const gestor = gestorIds ?? new Set<string>()
  const root = view.rightHand === undefined
    ? undefined
    : {
      ...toOrgPersona(view.rightHand, t, railByPersonaId, view.rightHand.sector, gestor),
      caption: view.rightHandCaption ?? t('org.rightHand'),
    }
  const rootId = view.rightHand?.id
  const groups = view.groups.map(group => ({
    id: group.id,
    title: group.title,
    ...(group.subtitle === undefined ? {} : { subtitle: group.subtitle }),
    kind: group.kind,
    ...(group.away === true ? { away: true as const } : {}),
    members: group.members
      .filter(member => member.id !== rootId)
      .map(member => toOrgPersona(
        member,
        t,
        railByPersonaId,
        member.sector ?? (group.kind === 'person' ? group.subtitle : group.title),
        gestor,
      )),
  }))
  return {
    ...(root === undefined ? {} : { root }),
    groups,
    personaCount: view.personaCount,
    humanCount: view.humanCount,
  }
}

export function twoDayToUi(
  dict: LocaleDict,
  view: TwoDayTestView,
  onFix: (row: TwoDayRowView) => void,
): {
  slotLabels: readonly string[]
  rows: readonly TwoDayRow[]
  legend: Readonly<Record<'runs' | 'waits' | 'stops', string>>
} {
  const t = (key: string) => bindLocale(dict, key)
  const slotLabels = view.slotLabels.length === 4 && !view.slotLabels.some(label => label.includes('+'))
    ? view.slotLabels
    : defaultTwoDaySlotLabels(dict)
  return {
    slotLabels,
    legend: {
      runs: t('twoDay.legend.runs'),
      waits: t('twoDay.legend.waits'),
      stops: t('twoDay.legend.stops'),
    },
    rows: view.rows.map(row => ({
      id: row.id,
      label: row.label,
      slots: row.slots,
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      ...(row.fixKind === undefined ? {} : {
        fixLabel: healthFixActionLabel(dict, row.fixKind as GovernanceFixKind),
        onFix: () => { onFix(row) },
      }),
    })),
  }
}

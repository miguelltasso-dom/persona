import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { Chip, PersonaCardPopover, Screen, ScreenHeader, SectorIcon, Tabs, usePersonaCardController } from '../primitives/index.ts'
import { OrgChart as OrgChartPrimitive } from '../primitives/Governance.tsx'
import { PersonaSurfaceEmpty, PersonaSurfaceError, PersonaSurfaceLoading } from '../kanban/PersonaSurface.tsx'
import type { OrgChartGroupBy, OrgChartView as OrgChartDto } from './governance-contract.ts'
import { railCharacterIdsFromLive } from './enrich-org-chart-rail.ts'
import { gestorPersonaIdsFromLive, orgChartHumansSubtitle, orgChartPersonasSubtitle, orgMapLabelsFromDict, sectorIdFromTitle } from './governance-ui-helpers.ts'
import { orgPersonaToCardInfo } from './org-persona-card-info.ts'
import type { PersonaLiveSnapshot } from '../remote/persona-live-store.ts'
import { orgChartToUi } from './map-governance-ui.ts'
import { PersonaInfoCard, type PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'
import styles from './GovernanceScreens.module.css'

export type OrgChartSurfaceState = 'loading' | 'error' | 'empty' | 'ready'

export interface OrgChartViewProps {
  readonly dict: LocaleDict
  readonly data: OrgChartDto | null
  readonly surfaceState: OrgChartSurfaceState
  readonly groupBy: OrgChartGroupBy
  readonly onGroupByChange: (groupBy: OrgChartGroupBy) => void
  readonly onRetry?: () => void
  readonly onSelectPersona?: (personaId: string) => void
  readonly cardInfo?: ((personaId: string) => PersonaCardInfo | undefined) | undefined
  readonly cardDict?: LocaleDict | undefined
  readonly onCardPrefetch?: ((personaId: string) => void) | undefined
  readonly onSendToPersona?: ((personaId: string, text: string) => void) | undefined
  readonly onOpenPersonaProfile?: ((personaId: string) => void) | undefined
  readonly onTogglePersonaPause?: ((personaId: string) => void) | undefined
  readonly onSwitchPersonaEngine?: ((personaId: string) => void) | undefined
  readonly onEditPersonaTalk?: ((personaId: string) => void) | undefined
  /** Host RPC missing: live roster or demo mock (Anvil GOV-5). */
  readonly preview?: boolean
  readonly live?: PersonaLiveSnapshot | null
  readonly hostOnline?: boolean
  readonly onBuildTeam?: (() => void) | undefined
}

type LayoutMode = 'chart' | 'list'

function findOrgPersona(
  ui: ReturnType<typeof orgChartToUi>,
  personaId: string,
): PersonaCardInfo | undefined {
  if (ui.root?.id === personaId) return orgPersonaToCardInfo(ui.root)
  for (const group of ui.groups) {
    const member = group.members.find(row => row.id === personaId)
    if (member !== undefined) return orgPersonaToCardInfo(member)
  }
  return undefined
}

export function OrgChartView({
  dict,
  data,
  surfaceState,
  groupBy,
  onGroupByChange,
  onRetry,
  onSelectPersona,
  cardInfo,
  cardDict,
  onCardPrefetch,
  onSendToPersona,
  onOpenPersonaProfile,
  onTogglePersonaPause,
  onSwitchPersonaEngine,
  onEditPersonaTalk,
  preview = false,
  live = null,
  hostOnline = false,
  onBuildTeam,
}: OrgChartViewProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [layout, setLayout] = useState<LayoutMode>('chart')
  const card = usePersonaCardController()
  const ready = surfaceState === 'ready' && data !== null
  const railByPersonaId = ready && live?.ready === true
    ? railCharacterIdsFromLive(live, hostOnline)
    : undefined
  const gestorIds = useMemo(() => {
    const fromLive = gestorPersonaIdsFromLive(live)
    if (data?.rightHand?.id !== undefined && data.rightHand.role.toLowerCase().includes('gestor')) {
      return new Set([...fromLive, data.rightHand.id])
    }
    return fromLive
  }, [data?.rightHand, live])
  const scaleLabels = useMemo(() => orgMapLabelsFromDict(dict), [dict])
  const ui = ready ? orgChartToUi(dict, data, railByPersonaId, gestorIds) : null

  const cardTrigger = useCallback((personaId: string) => {
    const props = card.triggerProps(personaId)
    return {
      ...props,
      onPointerEnter: (event: MouseEvent<HTMLElement>) => {
        onCardPrefetch?.(personaId)
        props.onPointerEnter(event)
      },
      onClick: (event: MouseEvent<HTMLElement>) => {
        onCardPrefetch?.(personaId)
        props.onClick(event)
      },
    }
  }, [card, onCardPrefetch])

  const cardData = useMemo((): PersonaCardInfo | undefined => {
    if (card.personaId === null || ui === null) return undefined
    return cardInfo?.(card.personaId) ?? findOrgPersona(ui, card.personaId)
  }, [card.personaId, cardInfo, ui])

  const header = (
    <ScreenHeader
      icon="equipe"
      eyebrow={t('header.eyebrowTeam')}
      title={t('org.title')}
      subtitle={data === null
        ? t('org.subtitleLoading')
        : `${orgChartPersonasSubtitle(dict, data.personaCount)} · ${orgChartHumansSubtitle(dict, data.humanCount)}`}
    />
  )

  if (surfaceState === 'empty') {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="org-chart">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-kanban"
          titleKey="org.empty.title"
          hintKey="org.empty.hint"
          {...(onBuildTeam === undefined
            ? {}
            : { primaryKey: 'org.empty.action', onPrimary: onBuildTeam })}
        />
      </Screen>
    )
  }

  if (surfaceState === 'loading' || data === null) {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="org-chart">
        {header}
        <PersonaSurfaceLoading dict={dict} messageKey="loading" skeletonColumns={3} />
      </Screen>
    )
  }

  if (surfaceState === 'error') {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="org-chart">
        {header}
        <PersonaSurfaceError dict={dict} titleKey="error.title" retryKey="error.retry" onRetry={() => { onRetry?.() }} />
      </Screen>
    )
  }

  if (data.personaCount === 0) {
    return (
      <Screen width="full" className={styles.shell} data-persona-surface="org-chart">
        {header}
        <PersonaSurfaceEmpty
          dict={dict}
          illustrationKey="empty-kanban"
          titleKey="org.empty.title"
          hintKey="org.empty.hint"
          {...(onBuildTeam === undefined
            ? {}
            : { primaryKey: 'org.empty.action', onPrimary: onBuildTeam })}
        />
      </Screen>
    )
  }

  const chartUi = ui!
  const groupsWithBadges = chartUi.groups.map(group => ({
    ...group,
    ...(group.kind === 'sector'
      ? {
        icon: <SectorIcon
          sector={data!.groups.find(row => row.id === group.id)?.sectorId ?? sectorIdFromTitle(group.title)}
          size={20}
        />,
      }
      : {}),
    ...(group.away === true ? { badge: <Chip size="s" tone="warning">{t('org.badgeAway')}</Chip> } : {}),
  }))

  return (
    <Screen width="full" className={styles.shell} data-persona-surface="org-chart">
      {header}
      {preview && (
        <p className={styles.previewNote} role="status">{t('org.previewNote')}</p>
      )}
      <div className={styles.toolbar}>
        <Tabs
          label={t('org.groupByLabel')}
          idPrefix="org-group-by"
          items={[
            { id: 'person', label: t('org.byPerson') },
            { id: 'sector', label: t('org.bySector') },
          ]}
          value={groupBy}
          onChange={(id) => { onGroupByChange(id as OrgChartGroupBy) }}
        />
        <Tabs
          label={t('org.layoutLabel')}
          idPrefix="org-layout"
          items={[
            { id: 'chart', label: t('org.layoutChart') },
            { id: 'list', label: t('org.layoutList') },
          ]}
          value={layout}
          onChange={(id) => { setLayout(id as LayoutMode) }}
        />
      </div>
      <OrgChartPrimitive
        {...(chartUi.root === undefined ? {} : { root: chartUi.root })}
        groups={groupsWithBadges}
        mode={layout}
        label={t('a11y.orgRegion')}
        {...(onSelectPersona !== undefined ? { onSelectPersona } : {})}
        cardTrigger={cardTrigger}
        scaleLabels={scaleLabels}
      />
      {cardData !== undefined && (
        <PersonaCardPopover {...card.popoverProps} label={cardData.name}>
          <PersonaInfoCard
            info={cardData}
            {...(cardDict === undefined ? {} : { dict: cardDict })}
            onOpenProfile={onOpenPersonaProfile === undefined ? undefined : () => { card.close(); onOpenPersonaProfile(cardData.personaId) }}
            onSendMessage={onSendToPersona === undefined ? undefined : (text) => { card.close(); onSendToPersona(cardData.personaId, text) }}
            onTogglePause={onTogglePersonaPause === undefined ? undefined : () => { card.close(); onTogglePersonaPause(cardData.personaId) }}
            onSwitchEngine={onSwitchPersonaEngine === undefined ? undefined : () => { card.close(); onSwitchPersonaEngine(cardData.personaId) }}
            onEditTalk={onEditPersonaTalk === undefined ? undefined : () => { card.close(); onEditPersonaTalk(cardData.personaId) }}
          />
        </PersonaCardPopover>
      )}
    </Screen>
  )
}

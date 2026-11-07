import { useCallback, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { deriveOrgChartFromLive } from '../governance/derive-org-from-live.ts'
import { OrgChartView } from '../governance/OrgChartView.tsx'
import type { OrgChartGroupBy, OrgChartView as OrgChartDto } from '../governance/governance-contract.ts'
import { enrichOrgChartWithRail } from '../governance/enrich-org-chart-rail.ts'
import { fetchOrgChart } from '../governance/governance-remote.ts'
import { readOrgChartScaleSeed } from '../governance/org-scale-dev.ts'
import { emptyOrgChart } from '../governance/empty-org-chart.ts'
import { mockLargeOrgChart } from '../governance/mock-governance.ts'
import { pt as governanceDict } from '../locale/governance/locales.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'
import type { ShellState } from '../shell/create-shell-store.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import type { PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'

export interface ConnectedOrgChartInjected extends LumenRemoteInjected {
  readonly openPersonaProfile: (personaId: string) => void
  /** CV-4: clicar no rosto abre a DM. */
  readonly openPersonaDm?: ((personaId: string) => void) | undefined
  readonly cardInfo?: ((personaId: string) => PersonaCardInfo | undefined) | undefined
  readonly prefetchPersonaCard?: ((personaId: string) => void) | undefined
  readonly cardDict?: LocaleDict | undefined
  readonly sendToPersona?: ((personaId: string, text: string) => void) | undefined
  readonly togglePersonaPause?: ((personaId: string) => void) | undefined
  readonly switchPersonaEngine?: ((personaId: string) => void) | undefined
  readonly editPersonaTalk?: ((personaId: string) => void) | undefined
  readonly openTeamSetup?: (() => void) | undefined
  readonly hooks: LumenRemoteInjected['hooks'] & {
    readonly live: HostObservable<PersonaLiveSnapshot>
    readonly shell: HostObservable<ShellState>
    readonly personaCardRevision: HostObservable<{ readonly n: number }>
  }
}

export type ConnectedOrgChartPanelProps = InjectFace<ConnectedOrgChartInjected>

function liveTeamIsEmpty(snap: PersonaLiveSnapshot): boolean {
  return snap.ready && snap.team !== null && snap.team.personas.length === 0
}

async function resolveOrgChart(
  persona: ConnectedOrgChartPanelProps['persona'],
  workspaceId: string,
  groupBy: OrgChartGroupBy,
  live: PersonaLiveSnapshot,
  hostOnline: boolean,
): Promise<{ readonly data: OrgChartDto; readonly preview: boolean }> {
  const scale = readOrgChartScaleSeed()
  if (scale !== null) {
    const data = enrichOrgChartWithRail(mockLargeOrgChart(workspaceId, groupBy, scale), live, hostOnline)
    return { data, preview: true }
  }
  if (liveTeamIsEmpty(live)) {
    return { data: emptyOrgChart(workspaceId, groupBy), preview: false }
  }
  if ('getOrgChart' in persona && typeof persona.getOrgChart === 'function') {
    const raw = await fetchOrgChart(persona, workspaceId, groupBy)
    const data = enrichOrgChartWithRail(raw, live, hostOnline)
    return { data, preview: false }
  }
  const derived = deriveOrgChartFromLive(workspaceId, groupBy, live, hostOnline)
  if (derived !== null) {
    return { data: derived, preview: true }
  }
  // Neither the host's organogram nor a live roster to draw one from: say so (error + retry), never show a sample team.
  throw new Error('org-chart-unavailable')
}

/** "Quem cuida de quem" — GOV-6. */
export function ConnectedOrgChartPanel({
  persona,
  useTenant,
  useLive,
  useShell,
  usePersonaCardRevision,
  openPersonaProfile,
  openPersonaDm,
  cardInfo,
  prefetchPersonaCard,
  cardDict,
  sendToPersona,
  togglePersonaPause,
  switchPersonaEngine,
  editPersonaTalk,
  openTeamSetup,
}: ConnectedOrgChartPanelProps): ReactNode {
  const { gate } = useRemoteTenantGate(useTenant)
  const live = useLive(state => state)
  const hostOnline = useShell(state => state.hostStatus === 'online')
  void usePersonaCardRevision(state => state.n)
  const [groupBy, setGroupBy] = useState<OrgChartGroupBy>('person')
  const workspaceId = gate === 'loading' || gate === 'error' ? null : gate.workspaceId

  const load = useCallback(async () => {
    if (workspaceId === null) throw new Error('no-workspace')
    return resolveOrgChart(persona, workspaceId, groupBy, live, hostOnline)
  }, [persona, workspaceId, groupBy, live, hostOnline])

  const loadKey = workspaceId === null ? '' : `${workspaceId}:org:${groupBy}:${live.ready ? 'live' : 'seed'}`
  const { state, retry } = usePersonaRemoteLoad(workspaceId !== null, loadKey, load)

  const teamEmpty = liveTeamIsEmpty(live)
  const surfaceState = teamEmpty
    ? 'empty'
    : gate === 'error' || state.status === 'error'
      ? 'error'
      : gate === 'loading' || state.status === 'loading'
        ? 'loading'
        : 'ready'

  const payload = state.status === 'ready' ? state.data : null

  return (
    <OrgChartView
      dict={governanceDict}
      data={payload?.data ?? null}
      preview={payload?.preview ?? false}
      surfaceState={surfaceState}
      onRetry={retry}
      {...(openTeamSetup === undefined ? {} : { onBuildTeam: openTeamSetup })}
      groupBy={groupBy}
      onGroupByChange={setGroupBy}
      onSelectPersona={(id) => { openPersonaProfile(id) }}
      {...(cardInfo === undefined ? {} : { cardInfo })}
      {...(cardDict === undefined ? {} : { cardDict })}
      {...(prefetchPersonaCard === undefined ? {} : { onCardPrefetch: prefetchPersonaCard })}
      {...(sendToPersona === undefined ? {} : { onSendToPersona: sendToPersona })}
      onOpenPersonaProfile={openPersonaProfile}
      {...(openPersonaDm === undefined ? {} : { onOpenPersonaDm: openPersonaDm })}
      {...(togglePersonaPause === undefined ? {} : { onTogglePersonaPause: togglePersonaPause })}
      {...(switchPersonaEngine === undefined ? {} : { onSwitchPersonaEngine: switchPersonaEngine })}
      {...(editPersonaTalk === undefined ? {} : { onEditPersonaTalk: editPersonaTalk })}
      live={live}
      hostOnline={hostOnline}
    />
  )
}

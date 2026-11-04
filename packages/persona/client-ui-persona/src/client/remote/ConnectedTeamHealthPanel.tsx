import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { TeamHealthView } from '../governance/TeamHealthView.tsx'
import type { GovernanceFixKind, TwoDayRowView, TwoDayTestView } from '../governance/governance-contract.ts'
import { deriveTwoDayFromLive } from '../governance/derive-two-day-from-live.ts'
import { preferDerivedTwoDay } from '../governance/two-day-prefer-derived.ts'
import { applyGovernanceFix, fetchTeamHealth, fetchTwoDayTest } from '../governance/governance-remote.ts'
import { MOCK_GESTOR_AUDIT_ACTIVITY } from '../governance/gestor-audit-mock.ts'
import { gestorActivityPersonaFromLive } from '../governance/gestor-audit-persona.ts'
import type { ActivityItem, ActivityKind } from '../primitives/Pooled.tsx'
import { pt as governanceDict } from '../locale/governance/locales.ts'
import type { PersonaLiveSnapshot } from './persona-live-store.ts'

export interface ConnectedTeamHealthInjected extends LumenRemoteInjected {
  readonly openTeamSetup?: (() => void) | undefined
  readonly hooks: LumenRemoteInjected['hooks'] & {
    readonly live: HostObservable<PersonaLiveSnapshot>
  }
}

export type ConnectedTeamHealthPanelProps = InjectFace<ConnectedTeamHealthInjected>

/** Saúde da equipe + Teste dos 2 dias — GOV-7. */
export function ConnectedTeamHealthPanel({ persona, useTenant, useLive, openTeamSetup }: ConnectedTeamHealthPanelProps): ReactNode {
  const { gate } = useRemoteTenantGate(useTenant)
  const live = useLive(state => state)
  const teamEmpty = live.ready && live.team !== null && live.team.personas.length === 0
  const workspaceId = gate === 'loading' || gate === 'error' ? null : gate.workspaceId
  const [twoDayToken, setTwoDayToken] = useState(0)

  const loadHealth = useCallback(async () => {
    if (workspaceId === null) throw new Error('no-workspace')
    return fetchTeamHealth(persona, workspaceId)
  }, [persona, workspaceId])

  const loadTwoDay = useCallback(async (): Promise<TwoDayTestView> => {
    if (workspaceId === null) throw new Error('no-workspace')
    const fromHost = await fetchTwoDayTest(persona, workspaceId)
    const derived = deriveTwoDayFromLive(governanceDict, workspaceId, live)
    const merged = preferDerivedTwoDay(fromHost, derived)
    if (merged.rows.length > 0) return merged
    return {
      workspaceId,
      slotLabels: fromHost.slotLabels.length === 4 ? fromHost.slotLabels : derived?.slotLabels ?? [],
      rows: [],
    }
  }, [persona, workspaceId, live])

  const healthKey = workspaceId === null ? '' : `${workspaceId}:health`
  const twoDayKey = workspaceId === null ? '' : `${workspaceId}:two-day:${twoDayToken}:${live.ready ? 'live' : 'seed'}`

  const { state: healthState, retry: retryHealth } = usePersonaRemoteLoad(workspaceId !== null, healthKey, loadHealth)
  const { state: twoDayState, retry: retryTwoDay } = usePersonaRemoteLoad(workspaceId !== null, twoDayKey, loadTwoDay)

  const surfaceState = teamEmpty
    ? 'empty'
    : gate === 'error' || healthState.status === 'error'
      ? 'error'
      : gate === 'loading' || healthState.status === 'loading'
        ? 'loading'
        : 'ready'

  const applyFix = async (findingId: string, fixKind: GovernanceFixKind, targetId?: string): Promise<void> => {
    if (workspaceId === null) return
    await applyGovernanceFix(persona, workspaceId, findingId, fixKind, targetId)
    retryHealth()
    setTwoDayToken(token => token + 1)
    retryTwoDay()
  }

  const onTwoDayFix = (row: TwoDayRowView): void => {
    if (row.fixKind === undefined) return
    void applyFix(row.id, row.fixKind, row.fixTargetId)
  }

  const gestorPersona = useMemo(() => gestorActivityPersonaFromLive(live), [live])

  const gestorItems: readonly ActivityItem[] = useMemo(() => {
    const raw = healthState.status === 'ready' ? healthState.data.gestorAudit : undefined
    if (raw !== undefined && raw.length > 0) {
      return raw.map((row) => {
        const kind: ActivityKind = row.action === 'hire'
          ? 'hire'
          : row.action === 'file'
            ? 'file'
            : row.action === 'command'
              ? 'command'
              : 'message'
        return {
          id: row.id,
          kind,
          title: row.summary,
          status: 'done' as const,
        }
      })
    }
    return MOCK_GESTOR_AUDIT_ACTIVITY
  }, [healthState])

  return (
    <TeamHealthView
      dict={governanceDict}
      health={healthState.status === 'ready' ? healthState.data : null}
      twoDay={twoDayState.status === 'ready' ? twoDayState.data : null}
      surfaceState={surfaceState}
      onRetry={retryHealth}
      onRunTwoDayTest={() => { setTwoDayToken(token => token + 1); retryTwoDay() }}
      onApplyFix={(findingId, fixKind, targetId) => { void applyFix(findingId, fixKind, targetId) }}
      onTwoDayFix={onTwoDayFix}
      gestorAudit={{ persona: gestorPersona, items: gestorItems }}
      twoDayPending={twoDayState.status === 'loading'}
      {...(openTeamSetup === undefined ? {} : { onBuildTeam: openTeamSetup })}
    />
  )
}

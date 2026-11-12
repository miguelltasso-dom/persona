import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { LumenRemoteInjected } from '../data/lumen-inject.ts'
import { usePersonaRemoteLoad } from '../data/use-persona-remote-load.ts'
import { useRemoteTenantGate } from '../data/use-remote-tenant-gate.ts'
import { TeamHealthView } from '../governance/TeamHealthView.tsx'
import type { GovernanceFixKind, TeamHealthView as TeamHealthDto, TwoDayRowView, TwoDayTestView } from '../governance/governance-contract.ts'
import { deriveTwoDayFromLive } from '../governance/derive-two-day-from-live.ts'
import { preferDerivedTwoDay } from '../governance/two-day-prefer-derived.ts'
import { applyGovernanceFix, fetchTeamHealth, fetchTwoDayTest } from '../governance/governance-remote.ts'
import { gestorActivityPersonaFromLive } from '../governance/gestor-audit-persona.ts'
import { humanizeInternalIds } from '../governance/humanize-ids.ts'
import { twoDayRowFace } from '../governance/two-day-faces.ts'
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
    const derived = deriveTwoDayFromLive(governanceDict, workspaceId, live)
    let fromHost: TwoDayTestView
    try {
      fromHost = await fetchTwoDayTest(persona, workspaceId)
    } catch (error: unknown) {
      // The host did not answer: the same test drawn from the real roster is honest; a sample is not (IV-8b).
      if (derived !== null && derived.rows.length > 0) return derived
      throw error
    }
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

  // The engine names a persona's routine after its id: the person reads "Iniciativa de Mídia", never `initiative:m-dia`.
  // Display text only — ids sent back to the host (finding/target ids) stay exactly as received.
  const team = live.team?.personas
  // While the host recalculates after a fix the screen keeps what it had (stale-while-revalidate): the meter must not turn into a skeleton, so
  // it can travel from the old grade to the new one.
  const lastHealth = useRef<TeamHealthDto | null>(null)
  const lastTwoDay = useRef<TwoDayTestView | null>(null)
  if (healthState.status === 'ready') lastHealth.current = healthState.data
  if (twoDayState.status === 'ready') lastTwoDay.current = twoDayState.data
  const healthData = healthState.status === 'ready' ? healthState.data : healthState.status === 'loading' ? lastHealth.current : null
  const twoDayData = twoDayState.status === 'ready' ? twoDayState.data : twoDayState.status === 'loading' ? lastTwoDay.current : null
  const health = useMemo(() => {
    if (healthData === null) return null
    const clean = (text: string): string => humanizeInternalIds(text, governanceDict, team)
    const data = healthData
    return {
      ...data,
      title: clean(data.title),
      ...(data.body === undefined ? {} : { body: clean(data.body) }),
      findings: data.findings.map(finding => ({
        ...finding,
        title: clean(finding.title),
        ...(finding.detail === undefined ? {} : { detail: clean(finding.detail) }),
      })),
    }
  }, [healthData, team])
  const twoDay = useMemo(() => {
    if (twoDayData === null) return null
    const clean = (text: string): string => humanizeInternalIds(text, governanceDict, team)
    return {
      ...twoDayData,
      rows: twoDayData.rows.map(row => ({
        ...row,
        label: clean(row.label),
        ...(row.reason === undefined ? {} : { reason: clean(row.reason) }),
      })),
    }
  }, [twoDayData, team])

  const surfaceState = teamEmpty
    ? 'empty'
    : gate === 'error' || healthState.status === 'error'
      ? 'error'
      : gate === 'loading' || (healthState.status === 'loading' && healthData === null)
        ? 'loading'
        : 'ready'

  const applyFix = async (findingId: string, fixKind: GovernanceFixKind, targetId?: string): Promise<void> => {
    if (workspaceId === null) return
    await applyGovernanceFix(persona, workspaceId, findingId, fixKind, targetId)
    retryHealth()
    setTwoDayToken(token => token + 1)
    retryTwoDay()
  }

  /** The one button for rows that share a diagnosis: each row's fix in turn, then ONE reread (the host recalculates the grade). */
  const applyFixes = async (rows: readonly TwoDayRowView[]): Promise<void> => {
    if (workspaceId === null) return
    for (const row of rows) {
      if (row.fixKind === undefined) continue
      try {
        await applyGovernanceFix(persona, workspaceId, row.id, row.fixKind, row.fixTargetId)
      } catch {
        // One row failing must not stop the others; the reread below shows what really changed.
      }
    }
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
    const raw = healthData === null ? undefined : healthData.gestorAudit
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
    // No audit from the host = nothing happened that we can vouch for: the screen hides the section (never a sample).
    return []
  }, [healthData])

  return (
    <TeamHealthView
      dict={governanceDict}
      health={health}
      twoDay={twoDay}
      surfaceState={surfaceState}
      onRetry={retryHealth}
      onRunTwoDayTest={() => { setTwoDayToken(token => token + 1); retryTwoDay() }}
      onApplyFix={(findingId, fixKind, targetId) => { void applyFix(findingId, fixKind, targetId) }}
      onTwoDayFix={onTwoDayFix}
      onTwoDayFixAll={(rows) => { void applyFixes(rows) }}
      faceOf={row => twoDayRowFace(row, live)}
      gestorAudit={{ persona: gestorPersona, items: gestorItems }}
      twoDayPending={twoDayState.status === 'loading' && twoDayData === null}
      firstDay={live.ready && !live.kanbanCards.some(card => card.column !== 'todo')}
      twoDayFailed={twoDayState.status === 'error'}
      {...(openTeamSetup === undefined ? {} : { onBuildTeam: openTeamSetup })}
    />
  )
}

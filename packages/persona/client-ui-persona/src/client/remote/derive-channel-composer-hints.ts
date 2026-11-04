import type { OfficialQuotaView } from '@deepseek-ai/dsh-persona-host/types'
import type { AutonomyLevel } from '../persona-editor/persona-draft.ts'
import { hostModeToAutonomyLevel, type HostAutonomyMode } from '../persona-editor/autonomy-map.ts'
import type { TeamView } from './persona-remote-types.ts'

export interface ChannelComposerHints {
  readonly responderAutonomy: AutonomyLevel
  readonly quotaBlocked: boolean
  readonly quotaResumeLabel?: string | undefined
  /** O host já respondeu sobre a cota (esgotada ou não). Antes disso `quotaBlocked: false` é "não sei", não "livre". */
  readonly quotaKnown?: boolean | undefined
}

export const DEFAULT_CHANNEL_COMPOSER_HINTS: ChannelComposerHints = {
  responderAutonomy: 'propose',
  quotaBlocked: false,
}

/** Host persona id for the coordination role (Router). */
export function coordinationHostPersonaId(team: TeamView | null): string | undefined {
  if (team === null) return undefined
  return team.personas.find(row => row.systemRoles.includes('coordination'))?.id
}

/** PRO-4 / T3 §12 — block composer when any official window is at 100%. */
export function quotaBlockedFromOfficialQuotas(
  quotas: readonly OfficialQuotaView[],
): { readonly blocked: boolean; readonly resumeLabel?: string | undefined } {
  for (const quota of quotas) {
    for (const window of quota.windows) {
      if (window.usedPercent === undefined || window.usedPercent < 100) continue
      const resetAt = window.resetsAt ?? quota.nextRefillAt
      if (resetAt === undefined || resetAt.length === 0) return { blocked: true }
      const time = new Date(resetAt)
      const resumeLabel = Number.isNaN(time.getTime())
        ? resetAt
        : time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      return { blocked: true, resumeLabel }
    }
  }
  return { blocked: false }
}

export function autonomyFromHostMode(mode: HostAutonomyMode): AutonomyLevel {
  return hostModeToAutonomyLevel(mode)
}

export interface ChannelComposerHintsRemote {
  getAutonomy?(request: {
    workspaceId: string
    projectId: string
    personaId: string
  }): { mode: HostAutonomyMode } | Promise<{ mode: HostAutonomyMode }>
  getOfficialQuota?(request: {
    workspaceId: string
    projectId: string
  }): readonly OfficialQuotaView[] | Promise<readonly OfficialQuotaView[]>
}

/** Best-effort PRO-4 hints after `listTeam` (never fails refresh). */
export async function loadChannelComposerHints(
  remote: ChannelComposerHintsRemote,
  scope: { readonly workspaceId: string; readonly projectId: string },
  team: TeamView | null,
): Promise<ChannelComposerHints> {
  let hints: ChannelComposerHints = DEFAULT_CHANNEL_COMPOSER_HINTS
  const coordId = coordinationHostPersonaId(team)
  if (coordId !== undefined && remote.getAutonomy !== undefined) {
    try {
      const row = await Promise.resolve(remote.getAutonomy({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        personaId: coordId,
      }))
      hints = { ...hints, responderAutonomy: autonomyFromHostMode(row.mode) }
    } catch {
      /* host optional */
    }
  }
  if (remote.getOfficialQuota !== undefined) {
    try {
      const quotas = await Promise.resolve(remote.getOfficialQuota({
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
      }))
      const quota = quotaBlockedFromOfficialQuotas(quotas)
      hints = {
        ...hints,
        quotaBlocked: quota.blocked,
        quotaKnown: true,
        ...(quota.resumeLabel === undefined ? {} : { quotaResumeLabel: quota.resumeLabel }),
      }
    } catch {
      /* quota optional */
    }
  }
  return hints
}

import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import { engineLabel } from '../team/engine-label.ts'
import { formatCardQuotaLimitedUntil } from './format-card-quota.ts'
import type { PersonaCardHostDto } from './persona-card-host-dto.ts'
import type { PersonaCardInfo } from './PersonaInfoCard.tsx'
import { inferPersonaPaused } from './infer-persona-paused.ts'

/** Maps host card RPC into {@link PersonaCardInfo} for Muse primitives. */
export function personaCardFromHost(dto: PersonaCardHostDto, characterId?: string): PersonaCardInfo {
  const engineLabelText = engineLabel(dto.engine.runnerLabel, dto.engine.modelLabel)
  return {
    personaId: dto.personaId,
    name: dto.name,
    handle: dto.handle.startsWith('@') ? dto.handle : `@${dto.handle}`,
    role: dto.title,
    ...(dto.sectorName === undefined ? {} : { sector: dto.sectorName }),
    ...(normalizeCharacterId(characterId ?? dto.handle.replace(/^@/u, '')) === undefined
      ? {}
      : { characterId: normalizeCharacterId(characterId ?? dto.handle.replace(/^@/u, '')) }),
    systemRoles: dto.systemRoles,
    nowKind: dto.nowKind,
    nowText: dto.nowText,
    paused: inferPersonaPaused(dto.nowKind, dto.nowText),
    presence: dto.presence.online ? 'online' : 'offline',
    ...(dto.ownerName === undefined ? {} : { ownerName: dto.ownerName }),
    ...(dto.substituteName === undefined ? {} : { substituteName: dto.substituteName }),
    ...(dto.currentProjectName === undefined ? {} : { projectName: dto.currentProjectName }),
    engineLabel: engineLabelText,
    ...(dto.quota === undefined
      ? {}
      : {
        quota: {
          ...(dto.quota.fiveHourPct === undefined ? {} : { fiveHourPct: dto.quota.fiveHourPct }),
          ...(dto.quota.weekPct === undefined ? {} : { weekPct: dto.quota.weekPct }),
          ...(dto.quota.limitedUntil === undefined
            ? {}
            : { limitedUntil: formatCardQuotaLimitedUntil(dto.quota.limitedUntil) }),
        },
      }),
  }
}

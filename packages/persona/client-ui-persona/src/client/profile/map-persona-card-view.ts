/** Host {@link PersonaCardView} → profile {@link PersonaCardInfo} (Muse / Anvil card RPC). */

import type { PersonaCardView, TalkAclView } from '@deepseek-ai/dsh-persona-host/types'
import { normalizeCharacterId } from '../governance/governance-ui-helpers.ts'
import type { PersonaCardInfo } from './PersonaInfoCard.tsx'
import { formatCardQuotaLimitedUntil } from './format-card-quota.ts'
import { inferPersonaPaused } from './infer-persona-paused.ts'
import { engineLabel, runnerLabel } from '../team/engine-label.ts'
import { talkAclViewToCardTalk } from './map-talk-acl.ts'
import { cardSystemRoles } from './card-system-roles.ts'

/** Map card RPC fields for profile hero and facts. */
export function personaCardViewToInfo(view: PersonaCardView, talkAcl?: TalkAclView): PersonaCardInfo {
  const portraitId = normalizeCharacterId(view.handle.replace(/^@/u, ''))
  return {
    personaId: view.personaId,
    name: view.name,
    handle: view.handle.startsWith('@') ? view.handle : `@${view.handle}`,
    role: view.title,
    ...(portraitId === undefined ? {} : { characterId: portraitId }),
    systemRoles: cardSystemRoles(view.systemRoles),
    nowKind: view.nowKind,
    nowText: view.nowText,
    paused: inferPersonaPaused(view.nowKind, view.nowText),
    presence: view.presence.online ? 'online' : 'offline',
    ...(view.sectorName === undefined ? {} : { sector: view.sectorName }),
    ...(view.ownerName === undefined ? {} : { ownerName: view.ownerName }),
    ...(view.substituteName === undefined ? {} : { substituteName: view.substituteName }),
    ...(view.currentProjectName === undefined ? {} : { projectName: view.currentProjectName }),
    engineLabel: engineLabel(view.engine.runnerLabel, view.engine.modelLabel),
    ...(view.engine.runnerModel === undefined ? {} : { runnerModel: view.engine.runnerModel }),
    ...(view.engine.runnerEffort === undefined ? {} : { runnerEffort: view.engine.runnerEffort }),
    ...(view.activeAccount === undefined
      ? {}
      : { activeAccountLabel: `${runnerLabel(view.activeAccount.provider)} · ${view.activeAccount.label}` }),
    ...(view.quota === undefined
      ? {}
      : {
        quota: {
          ...(view.quota.fiveHourPct === undefined ? {} : { fiveHourPct: view.quota.fiveHourPct }),
          ...(view.quota.weekPct === undefined ? {} : { weekPct: view.quota.weekPct }),
          ...(view.quota.limitedUntil === undefined
            ? {}
            : { limitedUntil: formatCardQuotaLimitedUntil(view.quota.limitedUntil) }),
        },
      }),
    ...(talkAcl === undefined ? {} : { talk: talkAclViewToCardTalk(talkAcl) }),
    ...(view.gestorAuditReason === undefined || view.gestorAuditReason === '' ? {} : { gestorAuditReason: view.gestorAuditReason }),
  }
}

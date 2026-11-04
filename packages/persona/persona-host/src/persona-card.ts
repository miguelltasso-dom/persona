/**
 * Aggregated persona card: talk ACL, now-line, charge, official quota.
 */

import type {
  ProductRepos,
  SqliteCardRepos,
  SqliteUsageStore,
  StoredOfficialQuota,
} from '@deepseek-ai/dsh-persona-store'
import { quotaCardMeters, type OfficialQuota } from '@deepseek-ai/dsh-persona-usage'
import type {
  CardQuotaView,
  PersonaNowKind,
  TalkAclPrincipalView,
  TalkAclView,
} from './types.ts'

/** Recusa de DM/@menção (nunca silêncio). */
export const SPEAK_REFUSED = 'Esta persona só conversa com quem o responsável escolheu.'

/**
 * Default talk ACL: anyone in the workspace.
 */
export function defaultTalkAcl(): TalkAclView {
  return { mode: 'workspace', principals: [] }
}

/**
 * Whether `actorId` may DM or @mention this persona.
 * @param acl - Stored ACL (missing = workspace).
 * @param actorId - Session member.
 * @param ownerId - Workspace owner (always allowed).
 * @param responsibleHumanId - Charge owner (always allowed).
 */
export function canAddressPersona(
  acl: TalkAclView | undefined,
  actorId: string,
  ownerId: string,
  responsibleHumanId: string,
): boolean {
  if (actorId === ownerId || (responsibleHumanId !== '' && actorId === responsibleHumanId)) return true
  if (acl === undefined || acl.mode === 'workspace') return true
  return acl.principals.some(row => row.id === actorId || row.id === `member:${actorId}`)
}

/** Inputs for the human now-line. */
export interface NowLineInput {
  readonly paused: boolean
  readonly state: 'working' | 'resting' | 'stuck' | 'waiting'
  readonly title: string
  readonly stage: string
  readonly engineLabel: string
  readonly lastActiveAt: string
  readonly limitedUntil: string
}

/**
 * Human "fazendo agora" from live assignment / attention / quota / pause.
 * @param input - Derived state.
 */
export function nowLineOf(input: NowLineInput): {
  nowKind: PersonaNowKind
  nowText: string
  presence: { online: boolean; lastActiveAt: string }
} {
  if (input.paused) {
    return {
      nowKind: 'offline',
      nowText: 'Offline',
      presence: { online: false, lastActiveAt: input.lastActiveAt },
    }
  }
  if (input.limitedUntil !== '') {
    const clock = input.limitedUntil.slice(11, 16)
    const when = clock === '' ? '' : ` às ${clock}`
    return {
      nowKind: 'quota',
      nowText: `Esperando o plano do ${input.engineLabel} renovar${when}`,
      presence: { online: true, lastActiveAt: input.lastActiveAt },
    }
  }
  if (input.state === 'stuck') {
    return {
      nowKind: 'stuck',
      nowText: input.title === '' ? 'Travado' : `Travado em ${input.title}`,
      presence: { online: true, lastActiveAt: input.lastActiveAt },
    }
  }
  if (input.state === 'waiting') {
    const approval = input.stage === 'blocked' || input.stage === 'needs_you' || input.stage === 'review'
    return {
      nowKind: approval ? 'waiting-approval' : 'waiting-reply',
      nowText: approval ? 'Esperando aprovação' : 'Esperando resposta',
      presence: { online: true, lastActiveAt: input.lastActiveAt },
    }
  }
  if (input.state === 'working' && input.title !== '') {
    const reviewing = input.stage === 'review'
    return {
      nowKind: reviewing ? 'reviewing' : 'working',
      nowText: reviewing ? `Revisando ${input.title}` : `Trabalhando em ${input.title}`,
      presence: { online: true, lastActiveAt: input.lastActiveAt },
    }
  }
  return {
    nowKind: 'resting',
    nowText: 'Descansando — nada na fila',
    presence: { online: true, lastActiveAt: input.lastActiveAt },
  }
}

/**
 * Card quota from official windows. Missing vendor data → `undefined` (never 0).
 * @param usage - Book.
 * @param projectId - Tenant.
 * @param provider - Runner provider.
 */
export function cardQuotaOf(
  usage: SqliteUsageStore,
  projectId: string,
  provider: string,
): CardQuotaView | undefined {
  const stored = usage.listQuota(projectId, provider)[0]
  if (stored === undefined) return undefined
  return quotaCardMeters(toOfficialQuota(stored))
}

/**
 * @param product - Members.
 * @param cards - Charge rows.
 * @param personaId - Persona.
 */
export function resolveCharge(
  product: ProductRepos,
  cards: SqliteCardRepos,
  personaId: string,
): { ownerName?: string; substituteName?: string; responsibleHumanId: string } {
  const charge = cards.getCharge(personaId)
  if (charge === undefined) return { responsibleHumanId: '' }
  return {
    responsibleHumanId: charge.responsibleHumanId,
    ownerName: displayName(product, charge.responsibleHumanId),
    ...(charge.substituteHumanId === undefined ? {} : { substituteName: displayName(product, charge.substituteHumanId) }),
  }
}

/**
 * @param product - Members.
 * @param speak - Stored ids.
 */
export function talkAclFromSpeak(
  product: ProductRepos,
  speak: { mode: 'everyone' | 'members'; principalIds: readonly string[] } | undefined,
): TalkAclView {
  if (speak === undefined || speak.mode === 'everyone') return defaultTalkAcl()
  const principals: TalkAclPrincipalView[] = speak.principalIds.map((raw) => {
    const group = raw.startsWith('group:') || raw.startsWith('sector:')
    const id = raw.replace(/^(group:|sector:|member:)/u, '')
    return {
      kind: group ? 'group' : 'person',
      id,
      name: group ? id : displayName(product, id),
    }
  })
  return { mode: 'chosen', principals }
}

/**
 * @param acl - Wire ACL.
 */
export function speakFromTalkAcl(acl: TalkAclView): { mode: 'everyone' | 'members'; principalIds: readonly string[] } {
  if (acl.mode === 'workspace') return { mode: 'everyone', principalIds: [] }
  return {
    mode: 'members',
    principalIds: acl.principals.map(row => (row.kind === 'group' ? `group:${row.id}` : row.id)),
  }
}

function displayName(product: ProductRepos, memberId: string): string {
  for (const workspace of product.listWorkspaces()) {
    const member = product.listMembers(workspace.id).find(row => row.id === memberId)
    if (member !== undefined) return member.displayName
  }
  return memberId
}

function toOfficialQuota(row: StoredOfficialQuota): OfficialQuota {
  return {
    provider: row.provider,
    origin: row.origin,
    windows: row.windows.map(window => ({
      id: window.id,
      origin: window.origin,
      ...(window.usedPercent === undefined ? {} : { usedPercent: window.usedPercent }),
      ...(window.windowMinutes === undefined ? {} : { windowMinutes: window.windowMinutes }),
      ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
    })),
    ...(row.detail === undefined ? {} : { detail: row.detail }),
  }
}

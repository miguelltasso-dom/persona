/**
 * Persona card wired to the profile locale (Muse, PERSONA-CARD-SPEC.md). `PersonaCardInfo` is the shape the host
 * card RPC returns (Anvil); the global popover mount (Prism) and the profile hero both render from it.
 */

import type { ReactNode } from 'react'
import { bindLocale, type LocaleDict } from '../preview/locale-bind.ts'
import {
  PersonaCard,
  PersonaCardFacts,
  type PersonaCardFact,
  type PersonaCardFactsProps,
  type PersonaCardLabels,
  type PersonaCardMenuItem,
  type PersonaNowKind,
  type PersonaPresence,
} from '../primitives/index.ts'
import { pt as defaultDict } from '../locale/profile/locales.ts'
import { humanizeEngineLabel } from '../team/engine-label.ts'
import type { PersonaLiveState } from './mock-data.ts'

export interface PersonaCardInfo {
  readonly personaId: string
  readonly name: string
  /** "@nina" */
  readonly handle?: string | undefined
  readonly role: string
  readonly sector?: string | undefined
  readonly characterId?: string | undefined
  readonly systemRoles: readonly ('coordination' | 'watchdog' | 'team_manager')[]
  readonly nowKind: PersonaNowKind
  /** Human sentence from the host; falls back to a generic line per kind. */
  readonly nowText?: string | undefined
  readonly presence: PersonaPresence
  /** Who can DM/@mention: everyone, or the chosen people/groups. Undefined = not loaded (row hidden). */
  readonly talk?: { readonly everyone: boolean; readonly names: readonly string[] } | undefined
  readonly ownerName?: string | undefined
  readonly substituteName?: string | undefined
  readonly projectName?: string | undefined
  /** "Plano do Claude · Sonnet" */
  readonly engineLabel?: string | undefined
  /** WAVE2 — "Claude · Trabalho" when a seat is active. */
  readonly activeAccountLabel?: string | undefined
  /** WAVE2 — "Troca para Pessoal no limite". */
  readonly accountPolicyText?: string | undefined
  /** Official quota (Rivet accountUsage). Undefined = unavailable, never 0%. */
  readonly quota?: {
    readonly fiveHourPct?: number | undefined
    readonly weekPct?: number | undefined
    /** Already formatted local time, e.g. "18:30". */
    readonly limitedUntil?: string | undefined
  } | undefined
  readonly paused?: boolean | undefined
}

const LIVE_TO_NOW: Readonly<Record<PersonaLiveState, PersonaNowKind>> = {
  idle: 'idle',
  working: 'working',
  reviewing: 'reviewing',
  waiting: 'waiting-reply',
  resting: 'resting',
  offline: 'offline',
  error: 'stuck',
}

const NOW_FALLBACK_KEY: Readonly<Record<PersonaNowKind, string>> = {
  idle: 'now.idle',
  working: 'now.working',
  reviewing: 'now.reviewing',
  'waiting-approval': 'now.waiting',
  'waiting-reply': 'now.waiting',
  quota: 'now.resting',
  resting: 'now.resting',
  stuck: 'now.error',
  offline: 'now.offline',
}

export function liveStateToNowKind(state: PersonaLiveState): PersonaNowKind {
  return LIVE_TO_NOW[state]
}

export function personaCardLabels(dict: LocaleDict, name: string): PersonaCardLabels {
  const t = (key: string, params?: Readonly<Record<string, string>>) => bindLocale(dict, key, params)
  return {
    nowCaption: t('card.nowCaption'),
    talkTitle: t('card.talkTitle'),
    talkEdit: t('card.talkEdit'),
    engine: t('card.engine'),
    quotaFiveHour: t('card.quotaFiveHour'),
    quotaWeek: t('card.quotaWeek'),
    quotaUnavailable: t('card.quotaUnavailable'),
    activeAccount: t('card.activeAccount'),
    menu: t('card.menu', { name }),
    send: t('card.send'),
    messagePlaceholder: t('card.message', { name }),
    presence: {
      online: t('card.presence.online'),
      away: t('card.presence.away'),
      offline: t('card.presence.offline'),
    },
  }
}

export function personaCardFacts(
  dict: LocaleDict,
  info: PersonaCardInfo,
  onEditTalk?: (() => void)  ,
): Omit<PersonaCardFactsProps, 'labels' | 'layout'> {
  const t = (key: string, params?: Readonly<Record<string, string>>) => bindLocale(dict, key, params)
  const facts: PersonaCardFact[] = [
    { id: 'presence', label: t('card.presenceLabel'), value: t(`card.presence.${info.presence}`) },
    {
      id: 'owner',
      label: t('card.owner'),
      value: info.ownerName ?? t('card.nobody'),
      tone: info.ownerName === undefined ? 'danger' : undefined,
    },
    {
      id: 'substitute',
      label: t('card.substitute'),
      value: info.substituteName ?? t('card.nobody'),
      tone: info.substituteName === undefined ? 'danger' : undefined,
    },
    { id: 'project', label: t('card.project'), value: info.projectName ?? t('card.noProject') },
  ]
  const quota = info.quota
  return {
    now: { kind: info.nowKind, text: info.nowText ?? t(NOW_FALLBACK_KEY[info.nowKind]) },
    talk: info.talk === undefined
      ? undefined
      : {
        everyone: info.talk.everyone,
        value: info.talk.everyone ? t('card.talkEveryone') : info.talk.names.join(', '),
        onEdit: onEditTalk,
      },
    facts,
    engine: info.engineLabel === undefined
      ? undefined
      : {
        value: humanizeEngineLabel(info.engineLabel),
        ...(info.activeAccountLabel === undefined ? {} : { activeAccountLabel: info.activeAccountLabel }),
        ...(info.accountPolicyText === undefined ? {} : { accountPolicyText: info.accountPolicyText }),
        quota: quota === undefined
          ? undefined
          : {
            fiveHourPct: quota.fiveHourPct,
            weekPct: quota.weekPct,
            limitText: quota.limitedUntil === undefined ? undefined : t('card.quotaLimit', { time: quota.limitedUntil }),
          },
      },
  }
}

export interface PersonaInfoCardProps {
  readonly info: PersonaCardInfo
  readonly dict?: LocaleDict | undefined
  readonly nameId?: string | undefined
  readonly onOpenProfile?: (() => void) | undefined
  readonly onEdit?: (() => void) | undefined
  readonly onTogglePause?: (() => void) | undefined
  readonly onSwitchEngine?: (() => void) | undefined
  readonly onEditTalk?: (() => void) | undefined
  readonly onTeach?: (() => void) | undefined
  /** Sends into the persona DM (and opens it). */
  readonly onSendMessage?: ((text: string) => void) | undefined
}

/** The popover card body from host data. */
export function PersonaInfoCard({
  info,
  dict = defaultDict,
  nameId,
  onOpenProfile,
  onEdit,
  onTogglePause,
  onSwitchEngine,
  onEditTalk,
  onTeach,
  onSendMessage,
}: PersonaInfoCardProps): ReactNode {
  const t = (key: string) => bindLocale(dict, key)
  const menu: PersonaCardMenuItem[] = []
  if (onOpenProfile !== undefined) menu.push({ id: 'profile', label: t('card.menu.profile'), onSelect: onOpenProfile })
  if (onEdit !== undefined) menu.push({ id: 'edit', label: t('card.menu.edit'), onSelect: onEdit })
  if (onSwitchEngine !== undefined) menu.push({ id: 'engine', label: t('card.menu.engine'), onSelect: onSwitchEngine })
  if (onTogglePause !== undefined) {
    menu.push({ id: 'pause', label: t(info.paused === true ? 'card.menu.resume' : 'card.menu.pause'), onSelect: onTogglePause })
  }
  if (onTeach !== undefined) menu.push({ id: 'teach', label: t('card.menu.teach'), onSelect: onTeach })
  return (
    <PersonaCard
      name={info.name}
      handle={info.handle}
      role={info.role}
      sector={info.sector}
      characterId={info.characterId}
      presence={info.presence}
      badges={info.systemRoles.map(role => ({ id: role, label: t(`card.badge.${role}`), ...(role === 'team_manager' ? { tone: 'gestor' as const } : {}) }))}
      menu={menu}
      nameId={nameId}
      onOpenProfile={onOpenProfile}
      onSendMessage={onSendMessage}
      labels={personaCardLabels(dict, info.name)}
      {...personaCardFacts(dict, info, onEditTalk)}
    />
  )
}

/** The same facts block, two columns, for the profile hero. */
export function PersonaInfoFacts({ info, dict = defaultDict, onEditTalk }: {
  readonly info: PersonaCardInfo
  readonly dict?: LocaleDict | undefined
  readonly onEditTalk?: (() => void) | undefined
}): ReactNode {
  return <PersonaCardFacts layout="wide" labels={personaCardLabels(dict, info.name)} {...personaCardFacts(dict, info, onEditTalk)} />
}

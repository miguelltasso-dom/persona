/** Rail “Sua equipe” — Muse owns presentation; Prism maps {@link RailPersona} in mount. */

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, OVERLAY_ICONS } from '../assets/generated-imports.ts'
import type { ShellKey } from '../locale/shell/locales.ts'
import { UiIcon } from '../primitives/index.ts'
import styles from './RailTeam.module.css'

export type RailPersonaState =
  | 'working'
  | 'reviewing'
  | 'waiting'
  | 'resting'
  | 'stuck'
  | 'offline'

export type RailPersonaCharacterId = 'atlas' | 'bento' | 'nina' | 'sol' | 'luna' | (string & {})

export interface RailPersona {
  /** Host persona id (wire). */
  readonly id: string
  /** Key for {@link AVATAR_96} / gallery pose. */
  readonly characterId: RailPersonaCharacterId
  readonly name: string
  /** Short role label (cargo). */
  readonly role: string
  readonly state: RailPersonaState
  /** Unread count in the DM thread with this persona. */
  readonly unread: number
}

/** Who needs you first, then who is working (Atlas/Miguel). */
const STATE_ORDER: Readonly<Record<RailPersonaState, number>> = {
  waiting: 0,
  stuck: 1,
  working: 2,
  reviewing: 3,
  resting: 4,
  offline: 5,
}

const STATE_LABEL: Readonly<Record<RailPersonaState, ShellKey>> = {
  working: 'team.statusWorking',
  reviewing: 'team.statusReviewing',
  waiting: 'team.statusWaiting',
  resting: 'team.statusResting',
  stuck: 'team.statusStuck',
  offline: 'team.statusOffline',
}

const STATE_ICON: Readonly<Record<RailPersonaState, keyof typeof OVERLAY_ICONS | undefined>> = {
  working: 'typing-dots',
  reviewing: 'review-loupe',
  waiting: 'approval-badge',
  resting: 'zzz',
  stuck: 'error-badge',
  offline: undefined,
}

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>
const VISIBLE_LIMIT = 6

export interface RailTeamProps {
  readonly t: PropsLocale<'persona.shell'>['t']
  readonly members: readonly RailPersona[]
  readonly collapsed: boolean
  readonly onOpenDm?: ((personaId: string) => void) | undefined
  readonly onOpenProfile?: ((personaId: string) => void) | undefined
  readonly onHire?: (() => void) | undefined
}

function initials(name: string): string {
  return name.trim().split(/\s+/u).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase()
}

/** "Sua equipe" in the rail: live state seal, DM unread, blink, top 6 + "ver todos", hire button. */
export function RailTeam({ t, members, collapsed, onOpenDm, onOpenProfile, onHire }: RailTeamProps): ReactNode {
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState(true)
  const sorted = useMemo(
    () => [...members].sort((a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state]) || (b.unread - a.unread) || a.name.localeCompare(b.name, 'pt-BR')),
    [members],
  )
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_LIMIT)

  return (
    <section className={styles.group} data-collapsed={collapsed ? '' : undefined} aria-labelledby="persona-rail-team-title">
      <button
        type="button"
        id="persona-rail-team-title"
        className={collapsed ? 'persona-sr-only' : `${styles.title} ${styles.titleToggle}`}
        aria-expanded={open}
        aria-controls="persona-rail-team-list"
        onClick={() => { setOpen(value => !value) }}
      >
        {t('sidebar.team.title')}
        {members.length > 0 && <span className={styles.count}>{members.length}</span>}
        <UiIcon name="chevronDown" size={14} strokeWidth={2.4} className={styles.chevron} />
      </button>
      {(open || collapsed) && (
        <ul className={styles.list} id="persona-rail-team-list">
          {visible.map((member, index) => {
            const status = t(STATE_LABEL[member.state])
            const portrait = PORTRAITS[member.characterId]
            const blink = PORTRAITS[`${member.characterId}-blink`]
            const icon = STATE_ICON[member.state]
            const label = [
              t('sidebar.team.openDm', { name: member.name }),
              member.role,
              status,
              member.unread > 0 ? t('sidebar.team.unread', { count: String(member.unread) }) : '',
            ].filter(Boolean).join(' · ')
            return (
              <li key={member.id} className={styles.row} data-state={member.state}>
                <button
                  type="button"
                  className={styles.person}
                  aria-label={label}
                  title={collapsed ? `${member.name} — ${status}` : undefined}
                  onClick={() => { onOpenDm?.(member.id) }}
                >
                  <span className={styles.avatar} style={{ '--blink-delay': `${2.3 + index * 1.7}s` } as CSSProperties} aria-hidden="true">
                    {portrait !== undefined ? (
                      <>
                        <img className={styles.face} src={portrait} alt="" draggable={false} />
                        {blink !== undefined && <img className={styles.blink} src={blink} alt="" draggable={false} />}
                      </>
                    ) : (
                      <span className={styles.initials}>{initials(member.name)}</span>
                    )}
                    <span className={styles.seal} data-state={member.state}>
                      {icon !== undefined && <img src={OVERLAY_ICONS[icon]} alt="" />}
                    </span>
                  </span>
                  {!collapsed && (
                    <span className={styles.text} aria-hidden="true">
                      <span className={styles.name}>{member.name}</span>
                      <span className={styles.role}>{member.role}</span>
                      <span className={styles.status}>{status}</span>
                    </span>
                  )}
                  {member.unread > 0 && (
                    <span className={styles.unread} aria-hidden="true">{member.unread > 99 ? '99+' : member.unread}</span>
                  )}
                </button>
                {!collapsed && onOpenProfile !== undefined && (
                  <button
                    type="button"
                    className={styles.more}
                    aria-label={t('sidebar.team.profile', { name: member.name })}
                    title={t('sidebar.team.profile', { name: member.name })}
                    onClick={() => { onOpenProfile(member.id) }}
                  >
                    <UiIcon name="more" size={18} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open && sorted.length > VISIBLE_LIMIT && !collapsed && (
        <button type="button" className={styles.seeAll} aria-expanded={showAll} onClick={() => { setShowAll(open => !open) }}>
          {showAll ? t('sidebar.team.seeLess') : t('sidebar.team.seeAll', { count: String(sorted.length) })}
        </button>
      )}
      {onHire !== undefined && (
        <button
          type="button"
          className={styles.hire}
          aria-label={collapsed ? t('sidebar.team.hire') : undefined}
          title={collapsed ? t('sidebar.team.hire') : undefined}
          onClick={onHire}
        >
          <span className={styles.hireIcon} aria-hidden="true"><UiIcon name="plus" size={16} strokeWidth={2.4} /></span>
          {!collapsed && <span>{t('sidebar.team.hire')}</span>}
        </button>
      )}
    </section>
  )
}

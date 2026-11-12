/** Rail “Sua equipe” — Muse owns presentation; Prism maps {@link RailPersona} in mount. */

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { rovingVerticalKey } from './rail-roving-focus.ts'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96, OVERLAY_ICONS } from '../assets/generated-imports.ts'
import { PERSONA_STATE_LABEL, PERSONA_STATE_OVERLAY, personaStateOf } from '../team/persona-state.ts'
import { PersonaCardPopover, UiIcon, usePersonaCardController, type PersonaNowKind } from '../primitives/index.ts'
import { PersonaInfoCard, type PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'
import { resolvePersonaFace } from '../approvals/approvals-ui-helpers.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
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
  /** Files already changed in the persona's draft ("Num rascunho"), Janela de silêncio ("Descansando") and a deliberate pause ("Pausada"); see `persona-state.ts`. */
  readonly draftFiles?: number | undefined
  readonly quiet?: boolean | undefined
  readonly paused?: boolean | undefined
  /** Unread count in the DM thread with this persona. */
  readonly unread: number
  /** Has the Gestor de equipe function (GESTOR-SPEC): baton mark on the avatar. */
  readonly gestor?: boolean
  /** Just hired: the avatar pops in once. */
  readonly arriving?: boolean
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


const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>
const VISIBLE_LIMIT = 6
const DENSITY_KEY = 'persona.rail.team.density.v1'

/** Avatars-only row by default on short windows so the essential navigation fits without scrolling (Atlas). */
function readDensity(): 'list' | 'avatars' {
  try {
    const stored = localStorage.getItem(DENSITY_KEY)
    if (stored === 'list' || stored === 'avatars') return stored
  } catch {
    /* storage unavailable */
  }
  return typeof window !== 'undefined' && window.innerHeight < 1000 ? 'avatars' : 'list'
}

export interface RailTeamProps {
  readonly t: PropsLocale<'persona.shell'>['t']
  readonly members: readonly RailPersona[]
  readonly collapsed: boolean
  readonly onOpenDm?: ((personaId: string) => void) | undefined
  readonly onOpenProfile?: ((personaId: string) => void) | undefined
  readonly onHire?: (() => void) | undefined
  /** Card "Mensagem para <nome>": open the DM and send (Prism wires live.openPersonaDm + postDmMessage). */
  readonly onSendToPersona?: ((personaId: string, text: string) => void) | undefined
  readonly onEditPersona?: ((personaId: string) => void) | undefined
  /** Full card data from the host (PERSONA-CARD-SPEC); rows without it get a card built from the rail row. */
  readonly cardInfo?: ((personaId: string) => PersonaCardInfo | undefined) | undefined
  /** persona.profile dictionary for the card copy (defaults to pt-BR). */
  readonly cardDict?: LocaleDict | undefined
  /** Prism: warm `getPersonaCard` before the hover popover opens. */
  readonly onCardPrefetch?: ((personaId: string) => void) | undefined
  readonly onTogglePersonaPause?: ((personaId: string) => void) | undefined
  /** Opens persona editor (motor tab is there until a dedicated picker ships). */
  readonly onSwitchPersonaEngine?: ((personaId: string) => void) | undefined
  readonly onEditPersonaTalk?: ((personaId: string) => void) | undefined
}

const STATE_NOW: Readonly<Record<RailPersonaState, PersonaNowKind>> = {
  working: 'working',
  reviewing: 'reviewing',
  waiting: 'waiting-approval',
  resting: 'resting',
  stuck: 'stuck',
  offline: 'offline',
}

function railCardInfo(member: RailPersona): PersonaCardInfo {
  return {
    personaId: member.id,
    name: member.name,
    role: member.role,
    characterId: member.characterId,
    systemRoles: [],
    nowKind: STATE_NOW[member.state],
    presence: member.state === 'offline' ? 'offline' : 'online',
  }
}

function initials(name: string): string {
  return name.trim().split(/\s+/u).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase()
}

/** "Sua equipe" in the rail: live state seal, DM unread, blink, top 6 + "ver todos", hire button. */
export function RailTeam({
  t, members, collapsed, onOpenDm, onOpenProfile, onHire, onSendToPersona, onEditPersona, cardInfo, cardDict, onCardPrefetch,
  onTogglePersonaPause, onSwitchPersonaEngine, onEditPersonaTalk,
}: RailTeamProps): ReactNode {
  const [showAll, setShowAll] = useState(false)
  const card = usePersonaCardController()
  const cardMember = card.personaId === null ? undefined : members.find(member => member.id === card.personaId)
  const cardData = cardMember === undefined ? undefined : (cardInfo?.(cardMember.id) ?? railCardInfo(cardMember))
  const [density, setDensity] = useState<'list' | 'avatars'>(readDensity)
  const compact = collapsed || density === 'avatars'
  const toggleDensity = (): void => {
    setDensity((value) => {
      const next = value === 'list' ? 'avatars' : 'list'
      try {
        localStorage.setItem(DENSITY_KEY, next)
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }
  const sorted = useMemo(
    () => [...members].sort((a, b) => (STATE_ORDER[a.state] - STATE_ORDER[b.state]) || (b.unread - a.unread) || a.name.localeCompare(b.name, 'pt-BR')),
    [members],
  )
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_LIMIT)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const focusRow = (index: number): void => { rowRefs.current[index]?.focus() }

  return (
    <section className={styles.group} data-collapsed={collapsed ? '' : undefined} data-density={density} aria-labelledby="persona-rail-team-title">
      <button
        type="button"
        id="persona-rail-team-title"
        className={collapsed ? 'persona-sr-only' : `${styles.title} ${styles.titleToggle}`}
        aria-expanded={density === 'list'}
        aria-controls="persona-rail-team-list"
        onClick={toggleDensity}
      >
        {t('sidebar.team.title')}
        {members.length > 0 && <span className={styles.count}>{members.length}</span>}
        <UiIcon name="chevronDown" size={14} strokeWidth={2.4} className={styles.chevron} />
      </button>
      {(
        <ul className={styles.list} id="persona-rail-team-list">
          {visible.map((member, index) => {
            const personaState = personaStateOf(member)
            const status = t(PERSONA_STATE_LABEL[personaState])
            // D-069: a persona is never a letter. A character the gallery does not know (a hired "Probe") gets the same stable animal its DM header draws.
            const portrait = PORTRAITS[member.characterId] ?? resolvePersonaFace({ id: member.id, characterId: member.characterId, name: member.name })
            const blink = PORTRAITS[`${member.characterId}-blink`]
            const icon = PERSONA_STATE_OVERLAY[personaState]
            const label = [
              t('sidebar.team.openDm', { name: member.name }),
              member.role,
              status,
              member.unread > 0 ? t('sidebar.team.unread', { count: String(member.unread) }) : '',
            ].filter(Boolean).join(' · ')
            // CONVERSAS-SPEC §5: clicar no rosto abre a DM; o cartão vem por hover longo, ⋯ ou Shift+F10.
            const face = card.faceProps(member.id, () => { onOpenDm?.(member.id) })
            return (
              <li key={member.id} className={styles.row} data-state={member.state}>
                <button
                  type="button"
                  className={styles.person}
                  aria-label={label}
                  ref={(node) => { rowRefs.current[index] = node }}
                  onClick={face.onClick}
                  aria-keyshortcuts={face['aria-keyshortcuts']}
                  onKeyDown={(event) => {
                    if (rovingVerticalKey(event, index, visible.length, focusRow)) return
                    // Keyboard path to the persona card in every density (UX-BACKLOG UX-07): Shift+F10 / tecla de menu.
                    face.onKeyDown(event)
                  }}
                  onPointerEnter={(event) => {
                    onCardPrefetch?.(member.id)
                    face.onPointerEnter(event)
                  }}
                  onPointerLeave={face.onPointerLeave}
                >
                  <span className={styles.avatar} data-arriving={member.arriving === true ? '' : undefined} style={{ '--blink-delay': `${2.3 + index * 1.7}s` } as CSSProperties} aria-hidden="true">
                    {member.gestor === true && <span className={styles.gestorMark}><UiIcon name="baton" size={11} strokeWidth={2.6} /></span>}
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
                  {!compact && (
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
                {!compact && (
                  <button
                    type="button"
                    className={styles.more}
                    aria-label={t('sidebar.team.profile', { name: member.name })}
                    title={t('sidebar.team.profile', { name: member.name })}
                    {...card.menuProps(member.id)}
                    onClick={(event) => {
                      onCardPrefetch?.(member.id)
                      card.menuProps(member.id).onClick(event)
                    }}
                  >
                    <UiIcon name="more" size={18} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {!compact && sorted.length > VISIBLE_LIMIT && (
        <button type="button" className={styles.seeAll} aria-expanded={showAll} onClick={() => { setShowAll(open => !open) }}>
          {showAll ? t('sidebar.team.seeLess') : t('sidebar.team.seeAll', { count: String(sorted.length) })}
        </button>
      )}
      {onHire !== undefined && (
        <button
          type="button"
          className={styles.hire}
          aria-label={compact ? t('sidebar.team.hire') : undefined}
          title={compact ? t('sidebar.team.hire') : undefined}
          onClick={onHire}
        >
          <span className={styles.hireIcon} aria-hidden="true"><UiIcon name="plus" size={16} strokeWidth={2.4} /></span>
          {!compact && <span>{t('sidebar.team.hire')}</span>}
        </button>
      )}
      {cardData !== undefined && (
        <PersonaCardPopover {...card.popoverProps} label={cardData.name}>
          <PersonaInfoCard
            info={cardData}
            {...(cardDict === undefined ? {} : { dict: cardDict })}
            onOpenProfile={onOpenProfile === undefined ? undefined : () => { card.close(); onOpenProfile(cardData.personaId) }}
            onEdit={onEditPersona === undefined ? undefined : () => { card.close(); onEditPersona(cardData.personaId) }}
            onSendMessage={onSendToPersona === undefined ? undefined : (text) => { card.close(); onSendToPersona(cardData.personaId, text) }}
            onTogglePause={onTogglePersonaPause === undefined ? undefined : () => { card.close(); onTogglePersonaPause(cardData.personaId) }}
            onSwitchEngine={onSwitchPersonaEngine === undefined ? undefined : () => { card.close(); onSwitchPersonaEngine(cardData.personaId) }}
            onEditTalk={onEditPersonaTalk === undefined ? undefined : () => { card.close(); onEditPersonaTalk(cardData.personaId) }}
          />
        </PersonaCardPopover>
      )}
    </section>
  )
}

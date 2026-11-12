/**
 * CV-1 (CONVERSAS-SPEC §0): a parte que rola da barra lilás única: Canais e Pessoas. Atrás da flag `persona.flag.navPlaces`
 * (o PersonaSidebar monta isto no lugar de PlacesRailNav + RailTeam só com a flag). Sem 2ª lista: clicar abre a conversa.
 *
 * O que decide o quê vive em `conversations-model.ts` (testado sem React); aqui só se desenha e se liga o teclado:
 *  - linha ativa = a conversa aberta (`aria-current="page"`, creme sobre plum);
 *  - ↑/↓/Home/End andam entre as linhas; Alt+↑/↓ percorre as conversas de qualquer lugar;
 *  - Canais, Pessoas e cada equipe recolhem e a barra lembra (localStorage com try/catch).
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { AVATAR_96 } from '../assets/generated-imports.ts'
import { Avatar, UiIcon } from '../primitives/index.ts'
import { PERSONA_STATE_LABEL, personaStateOf } from '../team/persona-state.ts'
import {
  buildConversationsModel,
  readCollapsedGroups,
  stepConversation,
  toggleGroup,
  writeCollapsedGroups,
  type ConversationChannel,
  type ConversationPerson,
  type PeopleGroup,
} from './conversations-model.ts'
import { sameConversation, type ConversationTarget, type OpenConversation } from './conversation-selection.ts'
import type { ConversationsSource } from './conversations-source.ts'
import { rovingVerticalKey } from './rail-roving-focus.ts'
import styles from './ConversationsRail.module.css'

export interface ConversationsRailProps {
  readonly t: PropsLocale<'persona.shell'>['t']
  readonly source: ConversationsSource
  /** A conversa aberta agora (`null` fora das conversas). */
  readonly active: ConversationTarget | null
  readonly openConversation: OpenConversation
  /** "Organizar a equipe": abre Quem cuida de quem. Sem isto o link não aparece. */
  readonly onOrganizeTeam?: (() => void) | undefined
  /** `trail` = o trilho de 64 px (960 / 200% ou barra recolhida): um # para os canais e os rostos das Recentes. */
  readonly variant?: 'full' | 'trail' | undefined
}

const SECTION_CHANNELS = 'section:channels'
const SECTION_PEOPLE = 'section:people'

const PORTRAITS = AVATAR_96 as Readonly<Record<string, string>>

type T = ConversationsRailProps['t']

/** A barra completa (296 px). */
function ConversationsFull({ t, source, active, openConversation, onOrganizeTeam }: ConversationsRailProps): ReactNode {
  const [remembered, setRemembered] = useState<Readonly<Record<string, boolean>>>(readCollapsedGroups)
  const model = useMemo(
    () => buildConversationsModel({ channels: source.channels, people: source.people, query: '', collapsed: remembered, active }),
    [source, remembered, active],
  )

  const toggle = (key: string, currentlyCollapsed: boolean): void => {
    setRemembered((previous) => {
      const next = toggleGroup(previous, key, currentlyCollapsed)
      writeCollapsedGroups(next)
      return next
    })
  }

  useAltArrowConversations(model.order, active, openConversation)

  // ↑/↓/Home/End entre as linhas visíveis (as de grupo recolhido não existem no DOM).
  const rootRef = useRef<HTMLDivElement>(null)
  const focusRow = (index: number): void => {
    rootRef.current?.querySelectorAll<HTMLElement>('[data-conversation-row]')[index]?.focus()
  }
  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[data-conversation-row]') ?? [])
    const index = rows.indexOf(event.currentTarget)
    if (index === -1) return
    if (event.key === 'Home') { event.preventDefault(); focusRow(0); return }
    if (event.key === 'End') { event.preventDefault(); focusRow(rows.length - 1); return }
    rovingVerticalKey(event, index, rows.length, focusRow)
  }

  // A linha ativa nunca fica fora da parte que rola.
  useEffect(() => {
    const row = rootRef.current?.querySelector<HTMLElement>('[aria-current="page"][data-conversation-row]')
    if (row !== null && row !== undefined && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' })
  }, [active, model.people.mode])

  const channelsCollapsed = remembered[SECTION_CHANNELS] === true
  const peopleCollapsed = remembered[SECTION_PEOPLE] === true
  const channelsId = useId()
  const peopleId = useId()
  const rowProps = { t, active, openConversation, onKeyDown: onRowKeyDown }
  const totalPeople = source.people.length

  return (
    <div className={styles.root} ref={rootRef} data-persona-conversations="">
      {model.channels.length > 0 && (
        <section className={styles.section}>
          <SectionHead
            id={channelsId}
            label={t('conversations.channels')}
            collapsed={channelsCollapsed}
            unread={channelsCollapsed ? model.channels.reduce((sum, channel) => sum + channel.unread, 0) : 0}
            onToggle={() => { toggle(SECTION_CHANNELS, channelsCollapsed) }}
          />
          {!channelsCollapsed && (
            <ul className={styles.list} id={channelsId}>
              {model.channels.map(channel => (
                <li key={channel.id}><ChannelRow channel={channel} {...rowProps} /></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {totalPeople > 0 && (
        <section className={styles.section}>
          <SectionHead
            id={peopleId}
            label={t('conversations.people')}
            collapsed={peopleCollapsed}
            unread={peopleCollapsed ? source.people.reduce((sum, person) => sum + person.unread, 0) : 0}
            onToggle={() => { toggle(SECTION_PEOPLE, peopleCollapsed) }}
          />
          {!peopleCollapsed && (
            <div id={peopleId}>
              {model.people.mode === 'grouped'
                ? (
                  <>
                    <p className={styles.subhead}>{t('conversations.allPersonas', { count: String(model.people.total) })}</p>
                    {model.people.groups.map(group => (
                      <TeamGroup key={group.key} group={group} onOrganizeTeam={onOrganizeTeam} onToggle={toggle} {...rowProps} />
                    ))}
                  </>
                )
                : (
                  <ul className={styles.list}>
                    {model.people.people.map(person => (
                      <li key={person.id}><PersonRow person={person} density="full" {...rowProps} /></li>
                    ))}
                  </ul>
                )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// --- cabeçalhos ------------------------------------------------------------------------------------------------

function SectionHead({ id, label, collapsed, unread, onToggle }: {
  readonly id: string
  readonly label: string
  readonly collapsed: boolean
  readonly unread: number
  readonly onToggle: () => void
}): ReactNode {
  return (
    <button type="button" className={styles.sectionHead} aria-expanded={!collapsed} aria-controls={id} onClick={onToggle}>
      <UiIcon name="chevronDown" size={14} strokeWidth={2.4} className={collapsed ? `${styles.chevron} ${styles.chevronClosed}` : styles.chevron} />
      <span>{label}</span>
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
  )
}

interface RowCommon {
  readonly t: T
  readonly active: ConversationTarget | null
  readonly openConversation: OpenConversation
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
}

function TeamGroup({ group, onOrganizeTeam, onToggle, ...rowCommon }: RowCommon & {
  readonly group: PeopleGroup
  readonly onOrganizeTeam?: (() => void) | undefined
  readonly onToggle: (key: string, currentlyCollapsed: boolean) => void
}): ReactNode {
  const listId = useId()
  const name = group.teamName ?? rowCommon.t('conversations.noTeam')
  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.groupHead}
        aria-expanded={!group.collapsed}
        aria-controls={listId}
        onClick={() => { onToggle(group.key, group.collapsed) }}
      >
        <UiIcon name="chevronDown" size={14} strokeWidth={2.4} className={group.collapsed ? `${styles.chevron} ${styles.chevronClosed}` : styles.chevron} />
        <span className={styles.groupName}>{name}</span>
        <span className={styles.groupCount}>{group.people.length}</span>
        {group.collapsed && (
          <span className={styles.faces} aria-hidden="true">
            {group.faces.map(face => (
              <span key={face.id} className={styles.face}>
                <Avatar name={face.name} src={PORTRAITS[face.characterId ?? face.id]} size={24} shape="portrait" decorative />
              </span>
            ))}
          </span>
        )}
        {group.collapsed && group.unread > 0 && <span className={styles.badge} aria-hidden="true">{group.unread > 99 ? '99+' : group.unread}</span>}
      </button>
      {!group.collapsed && (
        <ul className={styles.list} id={listId}>
          {group.people.map(person => <li key={person.id}><PersonRow person={person} density="compact" {...rowCommon} /></li>)}
        </ul>
      )}
      {!group.collapsed && group.teamName === null && onOrganizeTeam !== undefined && (
        <button type="button" className={styles.organize} onClick={onOrganizeTeam}>{rowCommon.t('conversations.organizeTeam')}</button>
      )}
    </div>
  )
}

// --- linhas ----------------------------------------------------------------------------------------------------

function ChannelRow({ channel, t, active, openConversation, onKeyDown }: RowCommon & { readonly channel: ConversationChannel }): ReactNode {
  const target: ConversationTarget = { kind: 'channel', id: channel.id }
  const isActive = sameConversation(active, target)
  return (
    <button
      type="button"
      className={`${styles.row} ${styles.rowChannel}`}
      data-conversation-row=""
      data-conversation-kind="channel"
      aria-current={isActive ? 'page' : undefined}
      aria-describedby={channel.unread > 0 ? `${channel.id}-unread` : undefined}
      onClick={() => { openConversation(target) }}
      onKeyDown={onKeyDown}
    >
      <span className={styles.hash} aria-hidden="true">#</span>
      <span className={styles.channelName}>{channel.name}</span>
      {channel.note !== undefined && <span className={styles.note}>{`· ${channel.note}`}</span>}
      {channel.unread > 0 && (
        <>
          <span className={styles.badge} aria-hidden="true">{channel.unread > 99 ? '99+' : channel.unread}</span>
          <span id={`${channel.id}-unread`} className={styles.srOnly}>{t('sidebar.team.unread', { count: String(channel.unread) })}</span>
        </>
      )}
    </button>
  )
}

/** O selo de não lidas de uma pessoa: o número até 9, depois "9+" (DESIGN-01-MUSE §5.1 #06 cond. 1). */
export function unreadBadgeText(unread: number): string {
  return unread > 9 ? '9+' : String(unread)
}

function PersonRow({ person, density, t, active, openConversation, onKeyDown }: RowCommon & {
  readonly person: ConversationPerson
  readonly density: 'full' | 'compact'
}): ReactNode {
  const target: ConversationTarget = { kind: 'dm', personaId: person.id }
  const isActive = sameConversation(active, target)
  const state = personaStateOf(person)
  const label = personLabel(t, person)
  const full = density === 'full'
  return (
    <button
      type="button"
      className={`${styles.row} ${full ? styles.rowFull : styles.rowCompact}`}
      data-conversation-row=""
      data-conversation-kind="dm"
      data-persona-id={person.id}
      data-persona-state={state}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      onClick={() => { openConversation(target) }}
      onKeyDown={onKeyDown}
    >
      <Avatar
        name={person.name}
        src={PORTRAITS[person.characterId ?? person.id]}
        size={full ? 32 : 24}
        shape="portrait"
        state={state}
        decorative
      />
      <span className={styles.text}>
        <span className={styles.title}>
          <span className={styles.name}>{person.name}</span>
          <span className={styles.role}>{person.role}</span>
        </span>
        {full && person.lastLine !== undefined && person.lastLine !== '' && <span className={styles.last}>{person.lastLine}</span>}
      </span>
      {full && person.timeLabel !== undefined && person.unread === 0 && <span className={styles.time}>{person.timeLabel}</span>}
      {person.unread > 0 && <span className={styles.badge} aria-hidden="true">{unreadBadgeText(person.unread)}</span>}
    </button>
  )
}

/** Nome acessível de uma pessoa: "Abrir DM com Nina · Pesquisa · Trabalhando · 2 não lidas". */
function personLabel(t: T, person: ConversationPerson): string {
  return [
    t('sidebar.team.openDm', { name: person.name }),
    person.role,
    t(PERSONA_STATE_LABEL[personaStateOf(person)]),
    person.unread > 0 ? t('sidebar.team.unread', { count: String(person.unread) }) : '',
  ].filter(Boolean).join(' · ')
}

/** Alt+↑/↓ percorre as conversas na ordem da barra, de qualquer lugar da tela (barra completa e trilho). */
function useAltArrowConversations(order: readonly ConversationTarget[], active: ConversationTarget | null, openConversation: OpenConversation): void {
  const orderRef = useRef(order)
  orderRef.current = order
  const activeRef = useRef(active)
  activeRef.current = active
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.isComposing) return
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const next = stepConversation(orderRef.current, activeRef.current, event.key === 'ArrowDown' ? 1 : -1)
      if (next === null) return
      event.preventDefault()
      openConversation(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [openConversation])
}

/** CV-1: o que o PersonaSidebar monta. `trail` quando a barra vira o trilho de 64 px; senão a barra completa. */
export function ConversationsRail(props: ConversationsRailProps): ReactNode {
  return props.variant === 'trail' ? <ConversationsTrail {...props} /> : <ConversationsFull {...props} />
}

/**
 * O trilho de 64 px (960 / 200%): um # que abre a lista dos canais POR CIMA e os rostos das Recentes. Cada rosto é um botão que abre
 * a DM; o nome sempre acessível (o rosto sozinho não identifica). A lista dos canais é `position: fixed` (o rail corta o que sai dele).
 */
function ConversationsTrail({ t, source, active, openConversation }: ConversationsRailProps): ReactNode {
  const [remembered] = useState<Readonly<Record<string, boolean>>>(readCollapsedGroups)
  const model = useMemo(
    () => buildConversationsModel({ channels: source.channels, people: source.people, query: '', collapsed: remembered, active }),
    [source, remembered, active],
  )
  useAltArrowConversations(model.order, active, openConversation)
  // O trilho mostra TODAS as pessoas, na mesma ordem estável da barra aberta (Coordenação primeiro, depois a do host); a barra rola por dentro.
  const faces = source.people
  const [channelsOpen, setChannelsOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const hashRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLUListElement>(null)

  const toggleChannels = (): void => {
    if (!channelsOpen) {
      const rect = hashRef.current?.getBoundingClientRect()
      if (rect !== undefined) setPosition({ left: Math.round(rect.right + 8), top: Math.round(rect.top) })
    }
    setChannelsOpen(open => !open)
  }
  // Esc e clique fora fecham a lista dos canais (o foco volta ao #).
  useEffect(() => {
    if (!channelsOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault() // o Esc é desta lista: a barra que abre por cima não fecha junto
      setChannelsOpen(false)
      hashRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target !== null && (popoverRef.current?.contains(target) === true || hashRef.current?.contains(target) === true)) return
      setChannelsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [channelsOpen])
  // Ao abrir, o foco vai para o canal ativo (ou o primeiro).
  useEffect(() => {
    if (!channelsOpen) return
    const target = popoverRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? popoverRef.current?.querySelector<HTMLElement>('button')
    target?.focus()
  }, [channelsOpen])

  const channelActive = active?.kind === 'channel'
  const noopKeyDown = (): void => {}
  return (
    <div className={styles.trail} data-persona-conversations-trail="">
      {model.channels.length > 0 && (
        <>
          <button
            ref={hashRef}
            type="button"
            className={styles.trailHash}
            aria-haspopup="true"
            aria-expanded={channelsOpen}
            aria-label={t('conversations.channels')}
            aria-current={channelActive ? 'page' : undefined}
            onClick={toggleChannels}
          >
            <span aria-hidden="true">#</span>
          </button>
          {channelsOpen && (
            <ul ref={popoverRef} className={styles.trailPopover} style={{ left: position.left, top: position.top }} aria-label={t('conversations.channels')}>
              {model.channels.map(channel => (
                <li key={channel.id}>
                  <ChannelRow
                    channel={channel}
                    t={t}
                    active={active}
                    openConversation={(target) => { setChannelsOpen(false); openConversation(target) }}
                    onKeyDown={noopKeyDown}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <ul className={styles.trailFaces}>
        {faces.map((person) => {
          const isActive = sameConversation(active, { kind: 'dm', personaId: person.id })
          return (
            <li key={person.id}>
              <button
                type="button"
                className={styles.trailFace}
                data-conversation-row=""
                data-conversation-kind="dm"
                data-persona-id={person.id}
                aria-current={isActive ? 'page' : undefined}
                aria-label={personLabel(t, person)}
                onClick={() => { openConversation({ kind: 'dm', personaId: person.id }) }}
              >
                <Avatar name={person.name} src={PORTRAITS[person.characterId ?? person.id]} size={32} shape="portrait" state={personaStateOf(person)} decorative />
                {person.unread > 0 && <span className={styles.trailBadge} aria-hidden="true">{unreadBadgeText(person.unread)}</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

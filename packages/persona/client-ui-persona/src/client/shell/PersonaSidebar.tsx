import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS, symbol } from '../assets/generated-imports.ts'
import { BrandIcon, UiIcon, useActiveIndicator } from '../primitives/index.ts'
import type { MainPanelId, ShellState } from './create-shell-store.ts'
import { showPersonaDevHostBadge } from './persona-dev.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import type { PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'
import { RailTeam, type RailPersona } from './RailTeam.tsx'
import { NAV_GROUPS as GROUPS, SEARCH_FOCUS_EVENT } from './nav-groups.ts'
import { installAreaNavigation } from './area-navigation.ts'
import { UserAwayControl, formatAwayUntilWhen, isAwayExpired, type UserAwayState } from './UserAwayControl.tsx'
import styles from './PersonaSidebar.module.css'

export interface PersonaSidebarInjected {
  /** `team`: live "Sua equipe" rows (Prism wires from the live store). */
  hooks: {
    shell: HostObservable<ShellState>
    team: HostObservable<readonly RailPersona[]>
    /** Bumps when a host persona card finishes loading (rail popover). */
    personaCardRevision: HostObservable<{ readonly n: number }>
    /** Open decisions waiting on the person (same count as the Visão geral chip; DECISIONS-SPEC). */
    approvals: HostObservable<{ readonly pending: number }>
  }
  selectPanel(id: MainPanelId): void
  readonly openPersonaDm?: ((personaId: string) => void) | undefined
  readonly openPersonaProfile?: ((personaId: string) => void) | undefined
  /** "Estou fora" mudou (liga/desliga/prazo/expirou): o host precisa saber (organograma, aprovações). */
  readonly onAwayChange?: ((next: UserAwayState) => void) | undefined
  readonly hirePersona?: (() => void) | undefined
  /** Persona card "Mensagem para <nome>": open the DM and send the text (Prism). */
  readonly sendToPersona?: ((personaId: string, text: string) => void) | undefined
  readonly editPersona?: ((personaId: string) => void) | undefined
  readonly cardInfo?: ((personaId: string) => PersonaCardInfo | undefined) | undefined
  readonly prefetchPersonaCard?: ((personaId: string) => void) | undefined
  readonly cardDict?: LocaleDict | undefined
  readonly togglePersonaPause?: ((personaId: string) => void) | undefined
  readonly switchPersonaEngine?: ((personaId: string) => void) | undefined
  readonly editPersonaTalk?: ((personaId: string) => void) | undefined
}

const COLLAPSED_KEY = 'persona.rail.collapsed.v1'
const GROUPS_KEY = 'persona.rail.groups.v1'

/** Titled groups fold; short windows start with Equipe/Empresa folded so the essentials fit at 900 px (Atlas). */
function readGroupsOpen(): Readonly<Record<string, boolean>> {
  const tall = typeof window === 'undefined' || window.innerHeight >= 1000
  const defaults: Record<string, boolean> = { team: tall, work: true, company: tall, more: false }
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (raw !== null) return { ...defaults, ...(JSON.parse(raw) as Record<string, boolean>) }
  } catch {
    /* storage unavailable or corrupt */
  }
  return defaults
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export type PersonaSidebarProps =
  & PropsLocale<'persona.shell'>
  & PropsRenderSlots<'sidebar.settings'>
  & InjectFace<PersonaSidebarInjected>


/** Persona navigation rail: lilac paper, sticker active pill, Brush foliage at the foot. */
export function PersonaSidebar({
  t,
  useShell,
  useTeam,
  usePersonaCardRevision,
  useApprovals,
  selectPanel,
  renderSlot,
  openPersonaDm,
  openPersonaProfile,
  onAwayChange,
  hirePersona,
  sendToPersona,
  editPersona,
  cardInfo,
  prefetchPersonaCard,
  cardDict,
  togglePersonaPause,
  switchPersonaEngine,
  editPersonaTalk,
}: PersonaSidebarProps): ReactNode {
  const shell = useShell(state => state)
  const members = useTeam(rows => rows)
  void usePersonaCardRevision(state => state.n)
  const approvalsPending = useApprovals(state => state.pending)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleCollapsed = useCallback((): void => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1')
      } catch {
        /* storage unavailable */
      }
      return !value
    })
  }, [])
  const navRef = useRef<HTMLDivElement>(null)
  const activeGroup = GROUPS.find(group => group.items.some(item => item.panel === shell.activePanel))?.id
  const [groupsOpen, setGroupsOpen] = useState(readGroupsOpen)
  const toggleGroup = (id: string): void => {
    setGroupsOpen((previous) => {
      const next = { ...previous, [id]: previous[id] === false }
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })
  }

  // F6 / Shift+F6 (and Ctrl+F6) between areas — T3-UX-HARVEST §1.
  useEffect(() => installAreaNavigation(), [])

  // Ctrl K / ⌘K: the rail promises it (kbd hint), so it is a real global shortcut (UX-06). Opens Busca and focuses
  // its field (SearchView listens for SEARCH_FOCUS_EVENT, also when Busca is already open).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'k' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      event.preventDefault()
      selectPanel('search')
      requestAnimationFrame(() => { window.dispatchEvent(new Event(SEARCH_FOCUS_EVENT)) })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [selectPanel])

  const [awayState, setAwayState] = useState<UserAwayState>(() => {
    try {
      const stored = localStorage.getItem('persona.user.away')
      if (stored) return JSON.parse(stored) as UserAwayState
    } catch {}
    return { isAway: false, untilChoice: 'today18' }
  })
  const [awayPopoverOpen, setAwayPopoverOpen] = useState(false)
  const onAwayChangeRef = useRef(onAwayChange)
  onAwayChangeRef.current = onAwayChange
  const awayAnchorRef = useRef<HTMLDivElement>(null)
  const awayChipRef = useRef<HTMLButtonElement>(null)
  // Popover "Estou fora": Esc e clique fora fecham (o foco volta ao chip), como qualquer popover.
  useEffect(() => {
    if (!awayPopoverOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setAwayPopoverOpen(false)
      awayChipRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && awayAnchorRef.current?.contains(event.target) === true) return
      setAwayPopoverOpen(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [awayPopoverOpen])

  const handleAwayChange = useCallback((next: UserAwayState): void => {
    setAwayState(next)
    onAwayChangeRef.current?.(next)
    try {
      localStorage.setItem('persona.user.away', JSON.stringify(next))
      if (!next.isAway) {
        sessionStorage.removeItem('persona.proactivity.awaySummary.dismissed')
      }
    } catch {}
  }, [])

  // Passou o prazo de "Estou fora": a pessoa voltou sozinha (pílula volta a "Conectado"; a Visão geral mostra o resumo).
  useEffect(() => {
    if (!awayState.isAway) return undefined
    const check = (): void => {
      if (isAwayExpired(awayState, Date.now())) handleAwayChange({ ...awayState, isAway: false, untilAt: undefined })
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => { clearInterval(timer) }
  }, [awayState, handleAwayChange])

  const indicator = useActiveIndicator(navRef, '[data-nav-item][aria-current="page"]', 'y', [shell.activePanel, groupsOpen, collapsed, members.length])

  const hostLabel = shell.hostStatus === 'online'
    ? t('overview.hostConnected')
    : shell.hostStatus === 'offline'
      ? t('overview.hostOffline')
      : t('overview.hostPending')
  const devBadge = showPersonaDevHostBadge() && shell.hostProtocol !== null ? ` · p${shell.hostProtocol}` : ''

  return (
    <nav className={styles.sidebar} aria-label={t('brand.name')} data-persona-grain="" data-persona-area="rail" data-collapsed={collapsed ? '' : undefined}>
      <div className={styles.foliage} aria-hidden="true">
        {ILLUSTRATIONS['rail-foliage-light'] !== undefined && (
          <img className={styles.foliageLight} src={ILLUSTRATIONS['rail-foliage-light']} alt="" />
        )}
        {ILLUSTRATIONS['rail-foliage-dark'] !== undefined && (
          <img className={styles.foliageDark} src={ILLUSTRATIONS['rail-foliage-dark']} alt="" />
        )}
      </div>

      <div className={styles.brandRow}>
        <span className={styles.symbolBadge} aria-hidden="true">
          <img className={styles.symbol} src={symbol} alt="" />
        </span>
        <p className={styles.wordmark}>{t('brand.name')}</p>
        <button
          type="button"
          className={styles.collapse}
          aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-pressed={collapsed}
          onClick={toggleCollapsed}
        >
          <UiIcon name="chevronDown" size={16} strokeWidth={2.4} className={styles.collapseIcon} />
        </button>
      </div>

      <button
        type="button"
        className={styles.search}
        aria-label={t('sidebar.search')}
        aria-keyshortcuts="Control+K Meta+K"
        aria-current={shell.activePanel === 'search' ? 'page' : undefined}
        onClick={() => { selectPanel('search') }}
      >
        <BrandIcon name="busca" size={18} />
        <span className={styles.searchText}>{t('sidebar.searchHint')}</span>
        <kbd className={styles.kbd}>{t('sidebar.searchShortcut')}</kbd>
      </button>

      <div className={styles.navScroll} ref={navRef}>
        <span
          className={styles.activeIndicator}
          style={{ transform: `translateY(${indicator.offset}px)`, height: `${indicator.size}px`, opacity: indicator.visible ? 1 : 0 }}
          aria-hidden="true"
        />
        {GROUPS.map((group) => {
          const expanded = group.labelKey === undefined
            || group.id === activeGroup
            || (collapsed && group.id !== 'more')
            || groupsOpen[group.id] !== false
          const listId = `persona-nav-${group.id}`
          return (
            <div key={group.id} className={styles.group}>
              {group.labelKey !== undefined && (!collapsed || group.id === 'more' ? (
                <button
                  type="button"
                  className={`${styles.groupLabel} ${styles.groupToggle}`}
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => { toggleGroup(group.id) }}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowRight' && !expanded) {
                      event.preventDefault()
                      toggleGroup(group.id)
                    }
                    if (event.key === 'ArrowLeft' && expanded) {
                      event.preventDefault()
                      toggleGroup(group.id)
                    }
                  }}
                >
                  {t(group.labelKey)}
                  <UiIcon name="chevronDown" size={14} strokeWidth={2.4} className={styles.chevron ?? ''} />
                </button>
              ) : (
                <p className={styles.groupLabel}>{t(group.labelKey)}</p>
              ))}
              {expanded && (
                <ul className={styles.navList} id={listId}>
                  {group.items.map(item => (
                    <li key={item.panel}>
                      <button
                        type="button"
                        data-nav-item=""
                        className={styles.navItem}
                        aria-current={shell.activePanel === item.panel ? 'page' : undefined}
                        aria-label={collapsed ? t(item.labelKey) : undefined}
                        // The count is a description, NOT part of the name: boot gate, gallery and screen readers keep finding "Aprovações".
                        aria-describedby={item.panel === 'approvals' && approvalsPending > 0 ? 'persona-nav-approvals-pending' : undefined}
                        title={collapsed ? t(item.labelKey) : undefined}
                        onClick={() => { selectPanel(item.panel) }}
                      >
                        <BrandIcon name={item.icon} size={20} className={styles.navIcon ?? ''} />
                        <span className={styles.navLabel}>{t(item.labelKey)}</span>
                        {item.panel === 'approvals' && approvalsPending > 0 && (
                          <>
                            <span className={styles.navBadge} aria-hidden="true">
                              {approvalsPending > 99 ? '99+' : approvalsPending}
                            </span>
                            {/* aria-hidden: still read as the description (aria-describedby), never folded into the button name */}
                            <span id="persona-nav-approvals-pending" className={styles.srOnly} aria-hidden="true">
                              {t(approvalsPending === 1 ? 'sidebar.approvalsPending.one' : 'sidebar.approvalsPending', { count: String(approvalsPending) })}
                            </span>
                          </>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {group.id === 'main' && (members.length > 0 || hirePersona !== undefined) && (
                <RailTeam
                  t={t}
                  members={members}
                  collapsed={collapsed}
                  onOpenDm={openPersonaDm}
                  onOpenProfile={openPersonaProfile}
                  onHire={hirePersona}
                  onSendToPersona={sendToPersona}
                  onEditPersona={editPersona}
                  {...(cardInfo === undefined ? {} : { cardInfo })}
                  {...(cardDict === undefined ? {} : { cardDict })}
                  {...(prefetchPersonaCard === undefined ? {} : { onCardPrefetch: prefetchPersonaCard })}
                  {...(togglePersonaPause === undefined ? {} : { onTogglePersonaPause: togglePersonaPause })}
                  {...(switchPersonaEngine === undefined ? {} : { onSwitchPersonaEngine: switchPersonaEngine })}
                  {...(editPersonaTalk === undefined ? {} : { onEditPersonaTalk: editPersonaTalk })}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <div ref={awayAnchorRef} className={styles.statusAnchor}>
          <button
            ref={awayChipRef}
            type="button"
            className={`${styles.hostStatus} ${styles.hostStatusButton}`}
            data-status={awayState.isAway ? 'away' : shell.hostStatus}
            onClick={() => { setAwayPopoverOpen(prev => !prev) }}
            aria-expanded={awayPopoverOpen}
            aria-haspopup="dialog"
            aria-label={awayState.isAway ? t('away.railAwayUntil', { when: formatAwayUntilWhen(t, awayState) }) : hostLabel}
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {awayState.isAway ? t('away.railAwayUntil', { when: formatAwayUntilWhen(t, awayState) }) : hostLabel}
            {devBadge}
          </button>
          {awayPopoverOpen && (
            <div className={styles.awayPopover} role="dialog" aria-label={t('away.switchLabel')}>
              <UserAwayControl
                t={t}
                awayState={awayState}
                onChange={handleAwayChange}
                onDefineSubstitute={() => {
                  setAwayPopoverOpen(false)
                  selectPanel('orgChart')
                }}
              />
            </div>
          )}
        </div>
        <div className={styles.settingsFoot}>
          {renderSlot('sidebar.settings', { wide: true })}
        </div>
      </div>
    </nav>
  )
}

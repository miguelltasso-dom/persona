import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS, symbol } from '../assets/generated-imports.ts'
import { BrandIcon, Button, Tooltip, UiIcon, useActiveIndicator } from '../primitives/index.ts'
import type { MainPanelId, ShellState } from './create-shell-store.ts'
import { showPersonaDevHostBadge } from './persona-dev.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import type { PersonaCardInfo } from '../profile/PersonaInfoCard.tsx'
import { RailTeam, type RailPersona } from './RailTeam.tsx'
import { NAV_GROUPS as GROUPS, SEARCH_FOCUS_EVENT } from './nav-groups.ts'
import { installAreaNavigation } from './area-navigation.ts'
import { isPlacesNavEnabled } from './nav-flag.ts'
import type { ConversationTarget, OpenConversation } from './conversation-selection.ts'
import { PlacesRailNav } from './PlacesRailNav.tsx'
import { ConversationsRail } from './ConversationsRail.tsx'
import { FoliageLampHalo } from './FoliageLampHalo.tsx'
import { FoliageLampOff } from './FoliageLampOff.tsx'
import { isLampLightFlagOn } from '../chat/lamp-light.ts'
import { EMPTY_CONVERSATIONS, type ConversationsSource } from './conversations-source.ts'
import { UserAwayControl, formatAwayUntilWhen, isAwayExpired, type UserAwayState } from './UserAwayControl.tsx'
import { useShortViewport } from './use-short-viewport.ts'
import { useNarrowWindow } from './use-narrow-window.ts'
import type { RailAiStatus } from './rail-ai-status.ts'
import { deriveRailPill, railAiHint, railAiRowText } from './rail-pill.ts'
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
  /**
   * A conversa aberta (canal ou pessoa) para pintar a linha ativa da barra única; `null` fora das conversas.
   * Prop de topo (não `hooks`): o runtime transforma todo `hooks.x` em um `useX` OBRIGATÓRIO, e o rail antigo não precisa dele.
   */
  readonly activeConversation?: HostObservable<ConversationTarget | null> | undefined
  /** Abre uma conversa com 1 clique (canal ou pessoa), sem a 2ª lista de DMs. */
  readonly openConversation?: OpenConversation | undefined
  /**
   * CV-1: Canais e Pessoas da barra única (linhas prontas, com a equipe de cada persona). Prop de topo pelo mesmo motivo de
   * `activeConversation`. Sem ela (preview, testes) a barra antiga de pessoas (`RailTeam`) continua.
   */
  readonly conversations?: HostObservable<ConversationsSource> | undefined
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
  /** Estado real da IA para a pílula do rodapé (A-5). Sem ele (preview/testes) a pílula diz "Conectado" como antes. */
  readonly railAi?: HostObservable<RailAiStatus> | undefined
}

const NO_SUBSCRIBE = (): (() => void) => () => {}
const NO_AI = (): undefined => undefined

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
  activeConversation,
  openConversation,
  conversations,
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
  railAi,
}: PersonaSidebarProps): ReactNode {
  const shell = useShell(state => state)
  const aiStore = useMemo(() => (railAi === undefined
    ? { subscribe: NO_SUBSCRIBE, getSnapshot: NO_AI }
    : { subscribe: (listener: () => void) => railAi.subscribe(listener), getSnapshot: () => railAi.getSnapshot() as RailAiStatus | undefined }), [railAi])
  const aiStatus = useSyncExternalStore(aiStore.subscribe, aiStore.getSnapshot, NO_AI)
  const members = useTeam(rows => rows)
  // CV-1: as linhas da barra de conversas e a conversa aberta (mesmo cuidado do aiStore: sem fonte, fica vazio e estável).
  const conversationsStore = useMemo(() => (conversations === undefined
    ? { subscribe: NO_SUBSCRIBE, getSnapshot: (): ConversationsSource => EMPTY_CONVERSATIONS }
    : { subscribe: (listener: () => void) => conversations.subscribe(listener), getSnapshot: (): ConversationsSource => conversations.getSnapshot() }), [conversations])
  const conversationsSource = useSyncExternalStore(conversationsStore.subscribe, conversationsStore.getSnapshot, () => EMPTY_CONVERSATIONS)
  const activeStore = useMemo(() => (activeConversation === undefined
    ? { subscribe: NO_SUBSCRIBE, getSnapshot: (): ConversationTarget | null => null }
    : { subscribe: (listener: () => void) => activeConversation.subscribe(listener), getSnapshot: (): ConversationTarget | null => activeConversation.getSnapshot() }), [activeConversation])
  const activeConversationTarget = useSyncExternalStore(activeStore.subscribe, activeStore.getSnapshot, () => null)
  void usePersonaCardRevision(state => state.n)
  const approvalsPending = useApprovals(state => state.pending)
  const [userCollapsed, setCollapsed] = useState(readCollapsed)
  // P0-22: janela baixa (< 600 px, zoom 200%): sem folhagem e com o rodapé numa linha só.
  const short = useShortViewport()
  // CV-1: janela estreita (≤ 960 px) = o trilho de 64 px; a barra inteira abre por cima.
  const narrow = useNarrowWindow()
  const [trailOpen, setTrailOpen] = useState(false)
  const navElRef = useRef<HTMLElement>(null)
  const collapseRef = useRef<HTMLButtonElement>(null)
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
  const placesNav = isPlacesNavEnabled()
  // CV-1: a barra única (Canais + Pessoas no lugar da faixa da equipe) só existe com a flag do A-1 E com as conversas injetadas.
  const barraUnica = placesNav && conversations !== undefined && openConversation !== undefined
  const trail = barraUnica && narrow
  // O trilho fechado é a barra recolhida (ícones e rostos); aberto por cima mostra tudo.
  const collapsed = userCollapsed || (trail && !trailOpen)
  const closeTrail = useCallback((): void => { setTrailOpen(false) }, [])
  // CONVERSAS-SPEC §0.1: o rodapé do trilho (e da barra única recolhida) é uma coluna de alvos de 40 px: ponto, Ajuda, Configurações.
  const compactFooter = barraUnica && collapsed
  const toggleTrail = useCallback((): void => { setTrailOpen(open => !open) }, [])
  useEffect(() => { if (!trail) setTrailOpen(false) }, [trail])
  useEffect(() => {
    if (!trail || !trailOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      setTrailOpen(false)
      collapseRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null
      if (target !== null && navElRef.current?.contains(target) === true) return
      setTrailOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [trail, trailOpen])
  // A faixa SUA EQUIPE é a mesma no rail antigo e no novo (D-077: o novo só liga depois do aceite da Muse).
  const railTeam = (members.length > 0 || hirePersona !== undefined)
    ? (
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
    )
    : null
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

  // "?" abre Ajuda e atalhos (o tooltip do botão promete essa tecla). Fora de campos de texto e de janelas modais.
  // Só com a flag A-1 ligada: desligada, o app é o de antes e ninguém promete essa tecla.
  useEffect(() => {
    if (!isPlacesNavEnabled()) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName))) return
      if (document.querySelector('[aria-modal="true"]') !== null) return
      event.preventDefault()
      selectPanel('help')
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

  // Muse (axe color-contrast, prova do Quill): o esmaecido do fim da lista só existe enquanto HÁ mais lista embaixo. Se a lista cabe
  // inteira (não rola) ou já está no fim, nada fica apagado. Medido como o Modal faz (rola? ainda tem mais abaixo?).
  const [navScrolls, setNavScrolls] = useState(false)
  const [navMore, setNavMore] = useState(false)
  const [navAbove, setNavAbove] = useState(false)
  useEffect(() => {
    const list = navRef.current
    if (list === null) return undefined
    const check = (): void => {
      const scrolls = list.scrollHeight > list.clientHeight + 1
      setNavScrolls(scrolls)
      setNavMore(scrolls && list.scrollTop + list.clientHeight < list.scrollHeight - 4)
      setNavAbove(scrolls && list.scrollTop > 4)
    }
    list.addEventListener('scroll', check, { passive: true })
    check()
    if (typeof ResizeObserver === 'undefined') return () => { list.removeEventListener('scroll', check) }
    const observer = new ResizeObserver(check)
    observer.observe(list)
    for (const child of Array.from(list.children)) observer.observe(child)
    return () => { observer.disconnect(); list.removeEventListener('scroll', check) }
  }, [groupsOpen, collapsed, members.length, shell.activePanel])

  // A-5: a pílula diz o estado REAL da IA (ou "Fora até…" / equipe fora do ar), um por vez.
  const pill = deriveRailPill({
    t,
    hostStatus: shell.hostStatus,
    awayText: awayState.isAway ? t('away.railAwayUntil', { when: formatAwayUntilWhen(t, awayState) }) : null,
    ai: aiStatus,
  })
  const aiRowText = shell.hostStatus === 'offline' ? null : railAiRowText(t, aiStatus)
  // O "pronto" sem número não fica vago: a frase da Muse no tooltip da pílula e na linha do popover (some quando o dado chega).
  const aiHint = shell.hostStatus === 'online' && !awayState.isAway ? railAiHint(t, aiStatus) : null
  // Item 13: "Claude · não consegui conferir" tem a ação "Tentar de novo" (o host confere de novo); só um logout confirmado manda para Conexões.
  const retryAi = (railAi as { readonly retry?: () => Promise<void> } | undefined)?.retry
  const aiLink: { readonly label: string; readonly panel: 'connections' | 'usage' | null; readonly run?: () => Promise<void> } | null = aiStatus?.kind === 'unconfirmed'
    ? (retryAi === undefined ? null : { label: t('rail.ai.retry'), panel: null, run: retryAi })
    : aiStatus?.kind === 'unavailable'
      ? { label: t('rail.ai.connect'), panel: 'connections' as const }
      : aiStatus?.kind === 'ready'
        ? { label: t('rail.ai.openUsage'), panel: 'usage' as const }
        : null
  const devBadge = showPersonaDevHostBadge() && shell.hostProtocol !== null ? ` · p${shell.hostProtocol}` : ''
  const pillButton = (
    <button
      ref={awayChipRef}
      type="button"
      className={`${styles.hostStatus} ${styles.hostStatusButton}`}
      data-status={pill.tone}
      onClick={() => { setAwayPopoverOpen(prev => !prev) }}
      aria-expanded={awayPopoverOpen}
      aria-haspopup="dialog"
      aria-label={pill.text}
      {...(aiHint === null && !compactFooter ? { title: pill.text } : {})}
    >
      <span className={styles.statusDot} aria-hidden="true" />
      <span className={styles.hostStatusText}>
        {pill.text}
        {devBadge}
      </span>
    </button>
  )

  const helpFootButton = (
    <Tooltip content={t('sidebar.helpShortcuts')} shortcut={['?']} side="top">
      <button
        type="button"
        className={styles.helpButton}
        data-nav-item=""
        data-nav-panel="help"
        data-nav-icon="help"
        aria-current={shell.activePanel === 'help' ? 'page' : undefined}
        aria-label={t('sidebar.helpShortcuts')}
        aria-keyshortcuts="?"
        onClick={() => { selectPanel('help') }}
      >
        <UiIcon name="help" size={20} strokeWidth={2} />
      </button>
    </Tooltip>
  )

  return (
    <nav className={styles.sidebar} aria-label={t('brand.name')} data-persona-grain="" data-persona-area="rail" ref={navElRef} data-collapsed={collapsed ? '' : undefined} data-short={short ? '' : undefined} data-conversations={barraUnica ? '' : undefined} data-trail={trail ? '' : undefined} data-trail-open={trail && trailOpen ? '' : undefined}>
      <div className={styles.foliage} aria-hidden="true">
        {ILLUSTRATIONS['rail-foliage-light'] !== undefined && (
          <img className={styles.foliageLight} src={ILLUSTRATIONS['rail-foliage-light']} alt="" />
        )}
        {ILLUSTRATIONS['rail-foliage-dark'] !== undefined && (
          <img className={styles.foliageDark} src={ILLUSTRATIONS['rail-foliage-dark']} alt="" data-persona-foliage-dark="" />
        )}
        {/* Uau 5: no escuro, ao abrir, a luminária APAGADA some em 420 ms revelando a acesa (1 vez por abertura; depois sai do DOM). */}
        <FoliageLampOff armed={!shell.onboardingOpen} />
        {/* O halo da luminária (v1.1, atrás de persona.flag.lampLight; só no escuro e só com a arte v2): atrás de tudo, nunca do texto. */}
        {isLampLightFlagOn() && <FoliageLampHalo />}
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
          ref={collapseRef}
          onClick={trail ? toggleTrail : toggleCollapsed}
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
        onClick={() => { selectPanel('search'); closeTrail() }}
      >
        <BrandIcon name="busca" size={18} />
        <span className={styles.searchText}>{t('sidebar.searchHint')}</span>
        <kbd className={styles.kbd}>{t('sidebar.searchShortcut')}</kbd>
      </button>

      <div className={styles.navScroll} ref={navRef} data-scrolls={navScrolls ? 'true' : 'false'} data-more={navMore ? 'true' : 'false'} data-above={navAbove ? 'true' : 'false'}>
        <span
          className={styles.activeIndicator}
          style={{ transform: `translateY(${indicator.offset}px)`, height: `${indicator.size}px`, opacity: indicator.visible ? 1 : 0 }}
          aria-hidden="true"
        />
        {placesNav ? (
          <div className={styles.group}>
            <PlacesRailNav t={t} collapsed={collapsed} activePanel={shell.activePanel} approvalsPending={approvalsPending} selectPanel={barraUnica ? (panel) => { selectPanel(panel); closeTrail() } : selectPanel} compact={barraUnica} />
            {barraUnica && openConversation !== undefined
              ? (
                <ConversationsRail
                  t={t}
                  source={conversationsSource}
                  active={activeConversationTarget}
                  openConversation={(target) => { openConversation(target); closeTrail() }}
                  onOrganizeTeam={() => { selectPanel('orgChart'); closeTrail() }}
                  variant={collapsed ? 'trail' : 'full'}
                />
              )
              : railTeam}
          </div>
        ) : GROUPS.map((group) => {
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
                        // Rota estável para gates e capturas: o rótulo muda (NAV-SPEC A-1), o MainPanelId não.
                        data-nav-panel={item.panel}
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
              {group.id === 'main' && railTeam}
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <div ref={awayAnchorRef} className={styles.statusAnchor}>
          {/* Com o popover aberto o tooltip não existe: a linha da IA do popover já diz a mesma frase (Muse, A-5). */}
          {(compactFooter ? (aiHint ?? pill.text) : aiHint) === null ? pillButton : <Tooltip content={compactFooter ? (aiHint ?? pill.text) : (aiHint ?? '')} side="top" disabled={awayPopoverOpen}>{pillButton}</Tooltip>}
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
                {...(aiRowText === null ? {} : {
                  header: (
                    <div className={styles.aiRow} data-persona-rail-ai="">
                      <div className={styles.aiRowCopy}>
                        <p className={styles.aiRowText}>{aiRowText}</p>
                        {aiHint !== null && <p className={styles.aiRowHint}>{aiHint}</p>}
                      </div>
                      {aiLink !== null && (
                        <Button
                          size="s"
                          variant="ghost"
                          onClick={() => {
                            if (aiLink.run !== undefined) { void aiLink.run(); return }
                            setAwayPopoverOpen(false)
                            if (aiLink.panel !== null) selectPanel(aiLink.panel)
                          }}
                        >
                          {aiLink.label}
                        </Button>
                      )}
                    </div>
                  ),
                })}
              />
            </div>
          )}
        </div>
        {placesNav ? (
          // Flag A-1 LIGADA (D-077): "Configurações" é o lugar (o nosso SettingsLauncher no `settings.launcher`) e "Ajuda e
          // atalhos" é o ícone do rodapé. O slot do DSW segue montado: os indicadores de conexão e de atualização ficam ao lado.
          // Rail aberto: UMA fileira de 3 alvos de 40 px (DESIGN-01-MUSE §1.0.4): Configurações, a luminária no centro (a luz do escuro, só
          // decorativa) e Ajuda "?". O trilho de 64 px segue em coluna (ponto, Ajuda, Configurações) e não leva a luminária.
          <div className={styles.footActions} data-rail-foot-row={compactFooter ? undefined : ''}>
            {compactFooter && helpFootButton}
            <div className={styles.settingsSlot}>
              {renderSlot('sidebar.settings', { wide: !compactFooter })}
            </div>
            {!compactFooter && <span className={styles.lampSeat} data-persona-lamp-seat="" aria-hidden="true" />}
            {!compactFooter && helpFootButton}
          </div>
        ) : (
          // Flag DESLIGADA (padrão): o app é o de antes. "Configurações" é o gatilho do DSW (o fallback do `settings.launcher`,
          // que abre o modal com o Sobre) e a Ajuda continua o item do rail (grupo "Mais").
          <div className={styles.settingsFoot}>
            {renderSlot('sidebar.settings', { wide: !short })}
          </div>
        )}
      </div>
    </nav>
  )
}

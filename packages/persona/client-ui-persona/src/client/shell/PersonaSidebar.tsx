import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { ILLUSTRATIONS, symbol } from '../assets/generated-imports.ts'
import type { ShellKey } from '../locale/shell/locales.ts'
import { BrandIcon, UiIcon, type BrandIconName } from '../primitives/index.ts'
import type { MainPanelId, ShellState } from './create-shell-store.ts'
import { showPersonaDevHostBadge } from './persona-dev.ts'
import styles from './PersonaSidebar.module.css'

export interface PersonaSidebarInjected {
  hooks: { shell: HostObservable<ShellState> }
  selectPanel(id: MainPanelId): void
}

export type PersonaSidebarProps =
  & PropsLocale<'persona.shell'>
  & PropsRenderSlots<'sidebar.settings'>
  & InjectFace<PersonaSidebarInjected>

interface NavItem {
  readonly panel: MainPanelId
  readonly labelKey: ShellKey
  readonly icon: BrandIconName
}

interface NavGroup {
  readonly id: string
  readonly labelKey?: ShellKey
  readonly items: readonly NavItem[]
  readonly collapsible?: boolean
}

/** DESIGN-SYSTEM §6: grouped rail; daily surfaces first, rarely used ones under "Mais". */
const GROUPS: readonly NavGroup[] = [
  {
    id: 'main',
    items: [
      { panel: 'overview', labelKey: 'sidebar.overview', icon: 'visao-geral' },
      { panel: 'channels', labelKey: 'sidebar.channels', icon: 'canais' },
      { panel: 'directMessages', labelKey: 'sidebar.directMessages', icon: 'mensagens-diretas' },
      { panel: 'team', labelKey: 'sidebar.team', icon: 'equipe' },
    ],
  },
  {
    id: 'work',
    labelKey: 'sidebar.group.work',
    items: [
      { panel: 'projects', labelKey: 'sidebar.projects', icon: 'projetos' },
      { panel: 'kanban', labelKey: 'sidebar.kanban', icon: 'kanban' },
      { panel: 'routines', labelKey: 'sidebar.routines', icon: 'rotinas' },
      { panel: 'approvals', labelKey: 'sidebar.approvals', icon: 'decisoes' },
    ],
  },
  {
    id: 'company',
    labelKey: 'sidebar.group.company',
    items: [
      { panel: 'knowledge', labelKey: 'sidebar.knowledge', icon: 'conhecimento-memoria' },
      { panel: 'files', labelKey: 'sidebar.files', icon: 'arquivos' },
      { panel: 'rules', labelKey: 'sidebar.rules', icon: 'quadro' },
      { panel: 'connections', labelKey: 'sidebar.connections', icon: 'skills' },
      { panel: 'usage', labelKey: 'sidebar.usage', icon: 'uso-e-limites' },
    ],
  },
  {
    id: 'more',
    labelKey: 'sidebar.group.more',
    collapsible: true,
    items: [
      { panel: 'members', labelKey: 'sidebar.members', icon: 'convidar' },
      { panel: 'profile', labelKey: 'sidebar.profile', icon: 'equipe' },
      { panel: 'importers', labelKey: 'sidebar.importers', icon: 'arquivos' },
      { panel: 'canvas', labelKey: 'sidebar.canvas', icon: 'canvas' },
    ],
  },
]

/** Persona navigation rail: lilac paper, sticker active pill, Brush foliage at the foot. */
export function PersonaSidebar({ t, useShell, selectPanel, renderSlot }: PersonaSidebarProps): ReactNode {
  const shell = useShell(state => state)
  const navRef = useRef<HTMLDivElement>(null)
  const moreActive = GROUPS.find(group => group.id === 'more')?.items.some(item => item.panel === shell.activePanel) ?? false
  const [moreOpen, setMoreOpen] = useState(false)
  const [indicator, setIndicator] = useState({ top: 0, height: 0, opacity: 0 })
  const showMore = moreOpen || moreActive

  useLayoutEffect(() => {
    const root = navRef.current
    if (root === null) return
    const active = root.querySelector('[data-nav-item][aria-current="page"]')
    if (!(active instanceof HTMLElement)) {
      setIndicator(prev => ({ ...prev, opacity: 0 }))
      return
    }
    const rootBox = root.getBoundingClientRect()
    const box = active.getBoundingClientRect()
    setIndicator({ top: box.top - rootBox.top + root.scrollTop, height: box.height, opacity: 1 })
  }, [shell.activePanel, showMore])

  const hostLabel = shell.hostStatus === 'online'
    ? t('overview.hostConnected')
    : shell.hostStatus === 'offline'
      ? t('overview.hostOffline')
      : t('overview.hostPending')
  const devBadge = showPersonaDevHostBadge() && shell.hostProtocol !== null ? ` · p${shell.hostProtocol}` : ''

  return (
    <nav className={styles.sidebar} aria-label={t('brand.name')} data-persona-grain="">
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
      </div>

      <button
        type="button"
        className={styles.search}
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
          style={{ transform: `translateY(${indicator.top}px)`, height: `${indicator.height}px`, opacity: indicator.opacity }}
          aria-hidden="true"
        />
        {GROUPS.map((group) => {
          const expanded = group.collapsible !== true || showMore
          const listId = `persona-nav-${group.id}`
          return (
            <div key={group.id} className={styles.group}>
              {group.labelKey !== undefined && (group.collapsible === true ? (
                <button
                  type="button"
                  className={`${styles.groupLabel} ${styles.groupToggle}`}
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => { setMoreOpen(open => !open) }}
                >
                  {t(group.labelKey)}
                  <UiIcon name="chevronDown" size={14} strokeWidth={2.4} className={styles.chevron} />
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
                        onClick={() => { selectPanel(item.panel) }}
                      >
                        <BrandIcon name={item.icon} size={20} className={styles.navIcon} />
                        <span className={styles.navLabel}>{t(item.labelKey)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      <div className={styles.footer}>
        <div className={styles.hostStatus} role="status" data-status={shell.hostStatus}>
          <span className={styles.statusDot} aria-hidden="true" />
          {hostLabel}
          {devBadge}
        </div>
        <div className={styles.settingsFoot}>
          {renderSlot('sidebar.settings', { wide: true })}
        </div>
      </div>
    </nav>
  )
}

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { NAV_ICONS, symbol } from '../assets/generated-imports.ts'
import type { ShellKey } from '../locale/shell/locales.ts'
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

type NavIconId = keyof typeof NAV_ICONS

const NAV: readonly { panel: MainPanelId; labelKey: ShellKey; icon: NavIconId }[] = [
  { panel: 'team', labelKey: 'sidebar.team', icon: 'equipe' },
  { panel: 'search', labelKey: 'sidebar.search', icon: 'busca' },
  { panel: 'overview', labelKey: 'sidebar.overview', icon: 'visao-geral' },
  { panel: 'projects', labelKey: 'sidebar.projects', icon: 'projetos' },
  { panel: 'kanban', labelKey: 'sidebar.kanban', icon: 'kanban' },
  { panel: 'routines', labelKey: 'sidebar.routines', icon: 'rotinas' },
  { panel: 'channels', labelKey: 'sidebar.channels', icon: 'canais' },
  { panel: 'directMessages', labelKey: 'sidebar.directMessages', icon: 'mensagens-diretas' },
  { panel: 'usage', labelKey: 'sidebar.usage', icon: 'uso-e-limites' },
]

/** Persona navigation rail (pt-BR labels via locale). */
export function PersonaSidebar({ t, useShell, selectPanel, renderSlot }: PersonaSidebarProps): ReactNode {
  const shell = useShell(state => state)
  const navScrollRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState({ top: 0, height: 0, opacity: 0 })

  useLayoutEffect(() => {
    const root = navScrollRef.current
    if (root === null) return
    const active = root.querySelector('[aria-current="page"]')
    if (!(active instanceof HTMLElement)) {
      setIndicator(prev => ({ ...prev, opacity: 0 }))
      return
    }
    setIndicator({ top: active.offsetTop, height: active.offsetHeight, opacity: 1 })
  }, [shell.activePanel])

  const hostLabel = shell.hostStatus === 'online'
    ? t('overview.hostConnected')
    : shell.hostStatus === 'offline'
      ? t('overview.hostOffline')
      : t('overview.hostPending')
  const devBadge = showPersonaDevHostBadge() && shell.hostProtocol !== null
    ? ` · p${shell.hostProtocol}`
    : ''

  return (
    <nav className={styles.sidebar} aria-label={t('brand.name')}>
      <div className={styles.brandRow}>
        <img className={styles.symbol} src={symbol} alt="" aria-hidden="true" />
        <p className={styles.wordmark}>{t('brand.name')}</p>
      </div>
      <div className={styles.navScroll} ref={navScrollRef}>
        <div className={styles.navList}>
          <span
            className={styles.activeIndicator}
            style={{
              transform: `translateY(${indicator.top}px)`,
              height: `${indicator.height}px`,
              opacity: indicator.opacity,
            }}
            aria-hidden="true"
          />
          {NAV.map(item => (
            <button
              key={item.panel}
              type="button"
              className={styles.navItem}
              aria-current={shell.activePanel === item.panel ? 'page' : undefined}
              onClick={() => { selectPanel(item.panel) }}
            >
              <img className={styles.navIcon} src={NAV_ICONS[item.icon]} alt="" aria-hidden="true" />
              <span>{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.hostStatus} role="status">
          <span className={styles.statusDot} data-online={shell.hostStatus === 'online' ? '' : undefined} aria-hidden="true" />
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

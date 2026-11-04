/** A-1 (NAV-SPEC), atrás da flag {@link isPlacesNavEnabled}: os 6 lugares do rail, sempre à vista, sem grupos recolhidos. */

import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { BrandIcon } from '../primitives/index.ts'
import type { MainPanelId } from './create-shell-store.ts'
import { RAIL_PLACES, placeEntryPanel, placeOfPanel } from './nav-places.ts'
import styles from './PersonaSidebar.module.css'

export interface PlacesRailNavProps {
  readonly t: PropsLocale<'persona.shell'>['t']
  readonly collapsed: boolean
  readonly activePanel: MainPanelId
  readonly approvalsPending: number
  readonly selectPanel: (panel: MainPanelId) => void
}

export function PlacesRailNav({ t, collapsed, activePanel, approvalsPending, selectPanel }: PlacesRailNavProps): ReactNode {
  const activePlace = placeOfPanel(activePanel)
  return (
    <ul className={styles.navList} id="persona-nav-places">
      {RAIL_PLACES.map((place) => {
        const entry = placeEntryPanel(place)
        const withBadge = place.id === 'approvals' && approvalsPending > 0
        return (
          <li key={place.id}>
            <button
              type="button"
              data-nav-item=""
              data-nav-place={place.id}
              // Rotas estáveis para gates e capturas: o rótulo muda (NAV-SPEC A-1), o MainPanelId não.
              data-nav-panel={entry}
              data-nav-contains={place.tabs.map(tab => tab.panel).join(' ')}
              className={styles.navItem}
              aria-current={activePlace?.id === place.id ? 'page' : undefined}
              aria-label={collapsed ? t(place.labelKey) : undefined}
              // The count is a description, NOT part of the name: boot gate, gallery and screen readers keep finding "Aprovações".
              aria-describedby={withBadge ? 'persona-nav-approvals-pending' : undefined}
              title={collapsed ? t(place.labelKey) : undefined}
              onClick={() => { selectPanel(placeEntryPanel(place)) }}
            >
              <BrandIcon name={place.icon} size={20} className={styles.navIcon ?? ''} />
              <span className={styles.navLabel}>{t(place.labelKey)}</span>
              {withBadge && (
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
        )
      })}
    </ul>
  )
}

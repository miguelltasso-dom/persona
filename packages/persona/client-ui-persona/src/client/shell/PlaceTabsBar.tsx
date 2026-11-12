/** A-1 (NAV-SPEC): as telas de um lugar viram abas no topo do lugar; lembra a última aba por lugar. */

import { useEffect, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Tabs } from '../primitives/index.ts'
import type { MainPanelId } from './create-shell-store.ts'
import { placeOfPanel, rememberPlaceTab, visibleTabs } from './nav-places.ts'
import styles from './PlaceTabsBar.module.css'

export interface PlaceTabsBarProps {
  readonly t: PropsLocale<'persona.shell'>['t']
  readonly activePanel: MainPanelId
  readonly onSelect: (panel: MainPanelId) => void
}

/**
 * Sem barra quando o lugar tem uma tela só (Visão geral, Aprovações), quando a tela não é um lugar (Ajuda, perfil, busca) ou quando a tela
 * é uma das escondidas do lugar (a grade "Ver todos os projetos": as abas do lugar são do projeto da vez, e a grade não é de um projeto).
 */
export function PlaceTabsBar({ t, activePanel, onSelect }: PlaceTabsBarProps): ReactNode {
  const place = placeOfPanel(activePanel)

  useEffect(() => {
    if (place !== undefined) rememberPlaceTab(place, activePanel)
  }, [place, activePanel])

  const tabs = place === undefined ? [] : visibleTabs(place)
  if (place === undefined || tabs.length < 2 || !tabs.some(tab => tab.panel === activePanel)) return null
  return (
    <div className={styles.bar} data-persona-area="place-tabs" data-place={place.id}>
      <Tabs
        label={t('place.tabsLabel', { place: t(place.labelKey) })}
        idPrefix={`place-${place.id}`}
        value={activePanel}
        onChange={(panel) => { onSelect(panel as MainPanelId) }}
        items={tabs.map(tab => ({ id: tab.panel, label: t(tab.labelKey), dataPanel: tab.panel }))}
      />
    </div>
  )
}

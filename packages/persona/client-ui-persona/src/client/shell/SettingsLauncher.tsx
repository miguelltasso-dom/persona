/**
 * "Configurações" do rodapé do rail (NAV-SPEC regra 6, decisão da Muse 04/11): o NOSSO botão ocupa o lugar do gatilho do
 * DSW (`settings.launcher`) e abre o lugar com as abas. Uma engrenagem só. O slot do DSW segue montado em volta, então os
 * indicadores de conexão (Reconectar/Reiniciar) e de atualização do app continuam ao lado, e o modal do DSW (versão,
 * avisos de terceiros) abre pelo `openSettings` que este launcher entrega à ponte (aba "Sobre e atualizações" e Ctrl+,).
 */
import { useEffect, type ReactNode } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { BrandIcon, Tooltip } from '../primitives/index.ts'
import type { MainPanelId, ShellState } from './create-shell-store.ts'
import { NAV_PLACES, placeEntryPanel, placeOfPanel } from './nav-places.ts'
import { setOpenSettings } from './settings-launcher-bridge.ts'
import { useShortViewport } from './use-short-viewport.ts'
import styles from './SettingsLauncher.module.css'

export interface SettingsLauncherInjected {
  hooks: { shell: HostObservable<ShellState> }
  selectPanel(id: MainPanelId): void
}

export type SettingsLauncherProps =
  & PropsRuntime<'settings.launcher'>
  & PropsLocale<'persona.shell'>
  & InjectFace<SettingsLauncherInjected>

const SETTINGS_PLACE = NAV_PLACES.find(place => place.id === 'settings')

export function SettingsLauncher({ t, useShell, selectPanel, openSettings, wide }: SettingsLauncherProps): ReactNode {
  const activePanel = useShell(state => state.activePanel)
  const short = useShortViewport()
  useEffect(() => {
    setOpenSettings(openSettings)
    return () => { setOpenSettings(null) }
  }, [openSettings])
  if (SETTINGS_PLACE === undefined) return null
  const label = t('place.settings')
  // Só o ícone quando a janela é baixa OU quando o rodapé é o do trilho de 64 px (a sidebar passa `wide: false`).
  const iconOnly = short || wide === false
  const button = (
    <button
      type="button"
      className={styles.button}
      data-icon-only={iconOnly ? '' : undefined}
      data-nav-item=""
      data-nav-place="settings"
      data-nav-panel={placeEntryPanel(SETTINGS_PLACE)}
      data-nav-contains={SETTINGS_PLACE.tabs.map(tab => tab.panel).join(' ')}
      aria-current={placeOfPanel(activePanel)?.id === 'settings' ? 'page' : undefined}
      aria-label={label}
      onClick={() => { selectPanel(placeEntryPanel(SETTINGS_PLACE)) }}
    >
      <BrandIcon name="configuracoes" size={18} />
      <span className={styles.label}>{label}</span>
    </button>
  )
  // Só o ícone aparece; o nome fica no tooltip (e no aria-label).
  return iconOnly ? <Tooltip content={label} side="top">{button}</Tooltip> : button
}

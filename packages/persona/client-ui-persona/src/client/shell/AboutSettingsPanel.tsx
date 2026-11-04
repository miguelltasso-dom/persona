/** "Configurações › Sobre e atualizações": a versão, os avisos de terceiros e a atualização do app moram no modal do DSW. */

import { useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Card, Screen, ScreenHeader } from '../primitives/index.ts'
import { canOpenSettingsModal, openSettingsModal } from './settings-launcher-bridge.ts'
import styles from './AboutSettingsPanel.module.css'

/** O mesmo atalho do DSW (Ctrl + vírgula), em chips de tecla como no Tooltip. */
const SETTINGS_SHORTCUT = ['Ctrl', ','] as const

export type AboutSettingsPanelProps = PropsLocale<'persona.shell'>

export function AboutSettingsPanel({ t }: AboutSettingsPanelProps): ReactNode {
  // Lido na hora de desenhar: o launcher do rodapé monta antes desta tela abrir; sem ele o botão diz por que não abre.
  const [available] = useState(canOpenSettingsModal)
  return (
    <Screen>
      <ScreenHeader
        icon="configuracoes"
        eyebrow={t('place.settings')}
        title={t('about.title')}
        subtitle={t('about.subtitle')}
      />
      <Card as="section" titleAs="h2" title={t('about.cardTitle')} padding="m">
        <p className={styles.body}>{t('about.body')}</p>
        <div className={styles.actions}>
          <Button
            variant="primary"
            disabled={!available}
            aria-describedby={available ? undefined : 'persona-about-why'}
            onClick={() => { openSettingsModal() }}
          >
            {t('about.open')}
          </Button>
          {!available && <p id="persona-about-why" className={styles.why}>{t('about.unavailable')}</p>}
        </div>
        <p className={styles.shortcut}>
          {t('about.shortcut')}
          <span className={styles.keys}>
            {SETTINGS_SHORTCUT.map(key => <kbd key={key} className={styles.key}>{key}</kbd>)}
          </span>
        </p>
      </Card>
    </Screen>
  )
}

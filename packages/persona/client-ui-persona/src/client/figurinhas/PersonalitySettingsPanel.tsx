/** "Configurações › Personalidade": hoje só as Figurinhas (desligáveis). Atrás da flag `persona.flag.figurinhas` (D-077). */

import { useId, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Card, Screen, ScreenHeader, Switch } from '../primitives/index.ts'
import { readStickersEnabled, writeStickersEnabled } from './figurinhas-model.ts'
import styles from './PersonalitySettingsPanel.module.css'

export type PersonalitySettingsPanelProps = PropsLocale<'persona.shell'>

export function PersonalitySettingsPanel({ t }: PersonalitySettingsPanelProps): ReactNode {
  const labelId = useId()
  const hintId = useId()
  const [enabled, setEnabled] = useState(() => readStickersEnabled())
  return (
    <Screen>
      <ScreenHeader
        icon="configuracoes"
        eyebrow={t('place.settings')}
        title={t('personality.title')}
        subtitle={t('personality.subtitle')}
      />
      <Card as="section" titleAs="h2" title={t('personality.stickers.title')} padding="m">
        <div className={styles.row}>
          <div className={styles.text}>
            <p id={labelId} className={styles.label}>{t('personality.stickers.label')}</p>
            <p id={hintId} className={styles.hint}>{t('personality.stickers.hint')}</p>
          </div>
          <Switch
            checked={enabled}
            labelledBy={labelId}
            describedBy={hintId}
            onChange={(next) => { setEnabled(next); writeStickersEnabled(next) }}
          />
        </div>
      </Card>
    </Screen>
  )
}

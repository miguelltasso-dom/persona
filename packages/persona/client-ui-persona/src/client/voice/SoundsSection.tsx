/**
 * Item 20 (Muse §4): "Sons discretos" em Configurações › Aparência — o interruptor, a descrição e o volume Baixo · Médio.
 * Quill monta este componente na lista de Aparência com um gancho; a escolha é local (`persona.sounds.*`).
 */

import { useId, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Card, FilterChips, Switch } from '../primitives/index.ts'
import type { SoundVolume } from './sound-policy.ts'
import { readSoundVolume, readSoundsEnabled, writeSoundVolume, writeSoundsEnabled } from './sounds-preference.ts'
import styles from './SoundsSection.module.css'

export type SoundsSectionProps = PropsLocale<'persona.shell'>

export function SoundsSection({ t }: SoundsSectionProps): ReactNode {
  const labelId = useId()
  const hintId = useId()
  const [enabled, setEnabled] = useState(() => readSoundsEnabled())
  const [volume, setVolume] = useState<SoundVolume>(() => readSoundVolume())
  return (
    <Card as="section" titleAs="h2" title={t('sounds.title')} padding="m">
      <div className={styles.row}>
        <div className={styles.text}>
          <p id={labelId} className={styles.label}>{t('sounds.label')}</p>
          <p id={hintId} className={styles.hint}>{t('sounds.hint')}</p>
        </div>
        <Switch
          checked={enabled}
          labelledBy={labelId}
          describedBy={hintId}
          onChange={(next) => { setEnabled(next); writeSoundsEnabled(next) }}
        />
      </div>
      <div className={styles.volume}>
        <span className={styles.volumeLabel}>{t('sounds.volume')}</span>
        <FilterChips
          label={t('sounds.volume')}
          items={[{ id: 'low', label: t('sounds.low') }, { id: 'medium', label: t('sounds.medium') }]}
          value={volume}
          onChange={(id) => { setVolume(id); writeSoundVolume(id) }}
        />
      </div>
    </Card>
  )
}

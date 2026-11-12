/**
 * Figurinhas das personas em Configurações › Aparência (cena 22 da Muse): o interruptor com a dica e, embaixo, o leque de
 * 3 figurinhas reais (48 px, a -4°/2°/6°). Desligadas, o leque fica lavanda. Só aparece com a flag figurinhas ligada
 * (a gravação da escolha é a de sempre: `persona.figurinhas.enabled.v1`).
 */

import { useId, useState, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Card, Switch } from '../primitives/index.ts'
import {
  momentStickerUrl,
  readStickersEnabled,
  writeStickersEnabled,
  type StickerMoment,
} from './figurinhas-model.ts'
import styles from './StickersSection.module.css'

/** Leque (cena 22, revisão do Carbon): três personagens diferentes, uma reação cada. Atlas, Nina e Sol têm as três. */
const FAN_ITEMS: readonly { readonly animal: string; readonly moment: StickerMoment }[] = [
  { animal: 'atlas', moment: 'delivery' },
  { animal: 'nina', moment: 'goodMorning' },
  { animal: 'sol', moment: 'endOfDay' },
]

export type StickersSectionProps = PropsLocale<'persona.shell'>

export function StickersSection({ t }: StickersSectionProps): ReactNode {
  const labelId = useId()
  const hintId = useId()
  const [enabled, setEnabled] = useState(() => readStickersEnabled())
  const fan = FAN_ITEMS.flatMap(({ animal, moment }) => {
    const src = momentStickerUrl(animal, moment)
    return src === undefined ? [] : [{ moment, src }]
  })
  return (
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
      {/* Decorativo: o interruptor e a dica dizem o que o leque faz; as legendas das figurinhas moram no dicionário do chat. */}
      <ul className={styles.fan} data-sticker-fan="" data-enabled={enabled ? 'true' : 'false'} aria-hidden="true">
        {fan.map((item, index) => (
          <li key={item.moment} className={styles.fanItem} data-fan-index={index}>
            <img className={styles.fanImg} src={item.src} alt="" width={48} height={48} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

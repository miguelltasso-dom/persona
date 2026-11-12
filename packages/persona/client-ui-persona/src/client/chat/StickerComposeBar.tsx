/**
 * COLHEITA §14 (Quill): figurinha sozinha no composer. Com uma figurinha armada, a barra mostra a figurinha em 40 px, o botão
 * "Reagir" (manda a figurinha ao fio, sem texto, SEM abrir turno: a persona não responde) e o botão de tirar (32 px).
 * A dica "Figurinha sozinha não pede resposta." aparece uma vez, no primeiro uso (quem monta decide com `showHint`).
 */
import type { ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconButton, REACTION_EMOJI, stickerUrl, UiIcon, type ReactionId } from '../primitives/index.ts'
import styles from './StickerComposeBar.module.css'

type ChatT = PropsLocale<'persona.chat'>['t']

export interface StickerComposeBarProps {
  readonly t: ChatT
  /** Animal cuja figurinha se desenha (o do usuário, ou o da coordenação). */
  readonly animal?: string | undefined
  readonly reaction: ReactionId
  /** A dica aparece só na primeira vez (quem monta guarda o "já vi").*/
  readonly showHint: boolean
  readonly onSend: (reaction: ReactionId) => void
  readonly onClose: () => void
}

export function StickerComposeBar({ t, animal, reaction, showHint, onSend, onClose }: StickerComposeBarProps): ReactNode {
  const src = stickerUrl(animal, reaction)
  return (
    <div className={styles.bar} data-sticker-compose="">
      {src !== undefined
        ? <img className={styles.preview} src={src} alt="" aria-hidden="true" draggable={false} />
        : <span className={styles.emoji} aria-hidden="true">{REACTION_EMOJI[reaction]}</span>}
      <div className={styles.copy}>
        {showHint && <p className={styles.hint}>{t('sticker.hintAlone')}</p>}
      </div>
      <Button variant="primary" size="m" onClick={() => { onSend(reaction) }}>{t('sticker.react')}</Button>
      <IconButton
        size="s"
        variant="ghost"
        label={t('sticker.remove')}
        icon={<UiIcon name="close" size={16} strokeWidth={2.2} />}
        onClick={onClose}
      />
    </div>
  )
}

import type { ReactNode } from 'react'
import { Chip } from '../primitives/index.ts'
import { momentStickerUrl, stickerCaptionKey, type StickerMoment as Moment } from './figurinhas-model.ts'
import styles from './StickerMoment.module.css'

type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string

export interface StickerMomentProps {
  readonly t: Translate
  readonly moment: Moment
  /** Name the person gave the persona ("Nina"), never the animal. */
  readonly personaName: string
  /** Gallery key of the animal (`avatarRef`): which sticker set draws it. */
  readonly characterId: string | undefined
}

/**
 * A figurinha in the thread: the animal's sticker with the caption as LIVE TEXT in a chip below it (never inside the art),
 * so it translates and a screen reader says it. No art for the animal yet = nothing is shown (a sticker never falls back to an
 * emoji here: it is a moment, not a reaction).
 */
export function StickerMoment({ t, moment, personaName, characterId }: StickerMomentProps): ReactNode {
  const src = momentStickerUrl(characterId, moment)
  if (src === undefined) return null
  const caption = t(stickerCaptionKey(moment), { name: personaName })
  return (
    <figure className={styles.figure} data-persona-sticker={moment}>
      <img className={styles.art} src={src} alt="" aria-hidden="true" draggable={false} />
      <figcaption>
        <Chip tone="brand" size="s">{caption}</Chip>
      </figcaption>
    </figure>
  )
}

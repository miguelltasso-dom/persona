/**
 * Animal reaction stickers (Muse ↔ Brush contract: stickers/<animal>-<reaction>.png). The picker shows the six
 * reactions drawn by one animal; reaction chips show the sticker instead of the emoji. Until Brush's art for an
 * animal lands, the emoji fallback keeps every reaction usable.
 */

import type { ReactNode } from 'react'
import { STICKERS } from '../assets/generated-imports.ts'
import styles from './Stickers.module.css'

export const REACTION_IDS = ['joinha', 'coracao', 'rindo', 'comemorando', 'pensando', 'feito'] as const
export type ReactionId = (typeof REACTION_IDS)[number]

/** Content fallback while an animal has no sticker yet (reactions are content, not UI icons). */
export const REACTION_EMOJI: Readonly<Record<ReactionId, string>> = {
  joinha: '👍',
  coracao: '❤️',
  rindo: '😂',
  comemorando: '🎉',
  pensando: '🤔',
  feito: '✅',
}

/** Sticker URL for an animal (gallery refs like "nina-default" accepted); undefined when not drawn yet. */
export function stickerUrl(animal: string | undefined, reaction: ReactionId): string | undefined {
  if (animal === undefined) return undefined
  return STICKERS[`${animal.replace(/-default$/u, '')}-${reaction}`]
}

export interface StickerPickerProps {
  /** Whose sticker set to show (the persona being answered, or the user's chosen animal). */
  readonly animal?: string | undefined
  /** Translated names: "Joinha", "Coração"… (also the accessible names). */
  readonly labels: Readonly<Record<ReactionId, string>>
  /** Group label: "Reagir com figurinha". */
  readonly label: string
  readonly selected?: readonly ReactionId[]
  readonly onPick: (reaction: ReactionId) => void
}

/** 3×2 grid of sticker buttons; arrow keys move between them. */
export function StickerPicker({ animal, labels, label, selected = [], onPick }: StickerPickerProps): ReactNode {
  return (
    <div
      className={styles.picker}
      role="group"
      aria-label={label}
      onKeyDown={(event) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        if (index < 0) return
        event.preventDefault()
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 3 : -3
        buttons[(index + step + buttons.length) % buttons.length]?.focus()
      }}
    >
      {REACTION_IDS.map((reaction) => {
        const url = stickerUrl(animal, reaction)
        return (
          <button
            key={reaction}
            type="button"
            className={styles.sticker}
            aria-pressed={selected.includes(reaction)}
            aria-label={labels[reaction]}
            title={labels[reaction]}
            onClick={() => { onPick(reaction) }}
          >
            {url !== undefined
              ? <img src={url} alt="" draggable={false} />
              : <span className={styles.fallback} aria-hidden="true">{REACTION_EMOJI[reaction]}</span>}
          </button>
        )
      })}
    </div>
  )
}

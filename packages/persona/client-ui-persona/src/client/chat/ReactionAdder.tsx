/**
 * "+" reaction affordance with the Brush sticker picker (Muse). Prism drops it at the end of a message's
 * reactions row and wires `onReact` to the host; existing "👍 3" reactions map to sticker ids via
 * {@link reactionIdFromEmoji} so chips can show the author's animal sticker.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { IconButton, REACTION_EMOJI, REACTION_IDS, StickerPicker, UiIcon, type ReactionId } from '../primitives/index.ts'
import styles from './ReactionAdder.module.css'

/** "👍" → "joinha" (host reactions arrive as emoji strings). */
export function reactionIdFromEmoji(emoji: string): ReactionId | undefined {
  const clean = emoji.trim()
  return REACTION_IDS.find(id => REACTION_EMOJI[id] === clean || REACTION_EMOJI[id].replace('️', '') === clean.replace('️', ''))
}

export interface ReactionAdderProps {
  /** Animal whose sticker set to offer (the message author's persona, or the user's chosen animal). */
  readonly animal?: string | undefined
  /** "Reagir com figurinha" */
  readonly label: string
  readonly labels: Readonly<Record<ReactionId, string>>
  readonly selected?: readonly ReactionId[]
  /**
   * Where the picker opens: above the reactions row ("top-start", default) or below a hover action anchored to the
   * message's top-right corner ("bottom-end", so the first message never clips under the header).
   */
  readonly placement?: 'top-start' | 'bottom-end'
  /** Toggle the reaction on the host (Prism). Emoji is sent too for hosts that still store emoji strings. */
  readonly onReact: (reaction: ReactionId, emoji: string) => void
}

export function ReactionAdder({ animal, label, labels, selected = [], placement = 'top-start', onReact }: ReactionAdderProps): ReactNode {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pickerId = useId()

  useEffect(() => {
    if (!open) return undefined
    wrapRef.current?.querySelector<HTMLButtonElement>('[role="group"] button')?.focus()
    const onPointerDown = (event: PointerEvent): void => {
      if (wrapRef.current?.contains(event.target as Node) !== true) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [open])

  return (
    <div
      ref={wrapRef}
      className={styles.wrap}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        setOpen(false)
        buttonRef.current?.focus()
      }}
    >
      <IconButton
        ref={buttonRef}
        size="s"
        label={label}
        icon={<UiIcon name="smile" size={18} strokeWidth={2} />}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? pickerId : undefined}
        onClick={() => { setOpen(value => !value) }}
      />
      {open && (
        <div id={pickerId} className={`${styles.popover} ${placement === 'bottom-end' ? styles.bottomEnd : ''}`}>
          <StickerPicker
            animal={animal}
            label={label}
            labels={labels}
            selected={selected}
            onPick={(reaction) => {
              onReact(reaction, REACTION_EMOJI[reaction])
              setOpen(false)
              buttonRef.current?.focus()
            }}
          />
        </div>
      )}
    </div>
  )
}

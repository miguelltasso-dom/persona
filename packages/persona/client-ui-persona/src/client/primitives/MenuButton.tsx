/**
 * ⋯ menu (Muse): one accessible pattern for the persona card, subjects, accounts. Button with aria-haspopup,
 * list with role=menu, arrows/Home/End move, Esc closes and returns focus (without closing a parent overlay),
 * Tab or a click outside closes.
 */

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconButton } from './Button.tsx'
import { UiIcon } from './icons.tsx'
import styles from './MenuButton.module.css'

export interface MenuItem {
  readonly id: string
  readonly label: string
  readonly onSelect: () => void
  readonly tone?: 'danger' | undefined
  readonly disabled?: boolean | undefined
  /** Leading visual (e.g. a subject dot). Decorative. */
  readonly leading?: ReactNode
}

export interface MenuButtonProps {
  /** Accessible name of the button and the menu ("Mais ações para UI"). */
  readonly label: string
  readonly items: readonly MenuItem[]
  /** Which edge the menu aligns to. */
  readonly align?: 'start' | 'end'
  readonly variant?: 'ghost' | 'secondary'
  readonly className?: string | undefined
  readonly icon?: ReactNode
}

export interface MenuButtonHandle {
  /** Opens the menu with focus on the first item (Shift+F10 from a related control). */
  open(): void
}

export const MenuButton = forwardRef<MenuButtonHandle, MenuButtonProps>(function MenuButton(
  { label, items, align = 'end', variant = 'secondary', className, icon },
  handle,
): ReactNode {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useImperativeHandle(handle, () => ({ open: () => { setOpen(true) } }), [])

  useEffect(() => {
    if (!open) return undefined
    listRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus()
    const onPointerDown = (event: PointerEvent): void => {
      if (wrapRef.current?.contains(event.target as Node) !== true) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => { document.removeEventListener('pointerdown', onPointerDown, true) }
  }, [open])

  const close = (): void => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>): void => {
    const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])]
    const index = nodes.indexOf(document.activeElement as HTMLElement)
    if (event.key === 'Escape') {
      event.stopPropagation()
      event.preventDefault()
      close()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      nodes[(index + step + nodes.length) % nodes.length]?.focus()
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      nodes[event.key === 'Home' ? 0 : nodes.length - 1]?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={className === undefined ? styles.wrap : `${styles.wrap} ${className}`}>
      <IconButton
        ref={buttonRef}
        size="s"
        variant={variant}
        className={variant === 'secondary' ? styles.button : undefined}
        label={label}
        icon={icon ?? <UiIcon name="more" size={18} />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => { setOpen(value => !value) }}
      />
      {open && (
        <ul ref={listRef} id={menuId} role="menu" aria-label={label} className={styles.menu} data-align={align} onKeyDown={onKeyDown}>
          {items.map(item => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={styles.item}
                data-tone={item.tone}
                aria-disabled={item.disabled === true ? 'true' : undefined}
                onClick={() => {
                  if (item.disabled === true) return
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.leading !== undefined && <span className={styles.leading} aria-hidden="true">{item.leading}</span>}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
})

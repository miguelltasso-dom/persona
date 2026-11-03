/** Modal, Toast and Tooltip (DESIGN-SYSTEM §5). */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconButton } from './Button.tsx'
import { UiIcon, type UiIconName } from './icons.tsx'
import styles from './Overlays.module.css'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  readonly open: boolean
  readonly title: ReactNode
  /** Small caps line above the title (e.g. "Passo 1 de 5"). */
  readonly eyebrow?: ReactNode
  readonly description?: ReactNode
  /** Footer actions (right aligned). */
  readonly footer?: ReactNode
  /** Accessible label of the close button; omit to hide it (blocking flows). */
  readonly closeLabel?: string
  readonly onClose?: (() => void) | undefined
  readonly size?: 'm' | 'l'
  readonly children?: ReactNode
}

/** Dialog: plum scrim + blur, sticker card, focus trap, Esc closes. */
export function Modal({ open, title, eyebrow, description, footer, closeLabel, onClose, size = 'm', children }: ModalProps): ReactNode {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => { previous?.focus() }
  }, [open])

  if (!open) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape' && onClose !== undefined) {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (nodes === undefined || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className={styles.scrim} data-persona-root="" role="presentation" onKeyDown={onKeyDown}>
      <div
        ref={panelRef}
        className={size === 'l' ? `${styles.modal} ${styles.modalL}` : styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className={styles.modalHeader}>
          <div>
            {eyebrow !== undefined && <p className={styles.modalEyebrow}>{eyebrow}</p>}
            <h2 id={titleId} className={styles.modalTitle}>{title}</h2>
            {description !== undefined && <p className={styles.modalDescription}>{description}</p>}
          </div>
          {closeLabel !== undefined && onClose !== undefined && (
            <IconButton label={closeLabel} icon={<UiIcon name="close" />} onClick={onClose} />
          )}
        </header>
        {children !== undefined && <div className={styles.modalBody}>{children}</div>}
        {footer !== undefined && <footer className={styles.modalFooter}>{footer}</footer>}
      </div>
    </div>
  )
}

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'celebrate'

export interface ToastProps {
  readonly tone?: ToastTone
  readonly title: ReactNode
  readonly body?: ReactNode
  readonly action?: ReactNode
  readonly dismissLabel?: string
  readonly onDismiss?: (() => void) | undefined
}

const TOAST_ICON: Readonly<Record<ToastTone, UiIconName>> = {
  neutral: 'sparkle',
  success: 'check',
  warning: 'clock',
  danger: 'alert',
  celebrate: 'sparkle',
}

/** Toast card (render inside <ToastRegion>). Enters from below with spring. */
export function Toast({ tone = 'neutral', title, body, action, dismissLabel, onDismiss }: ToastProps): ReactNode {
  return (
    <div className={styles.toast} data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className={styles.toastIcon} aria-hidden="true"><UiIcon name={TOAST_ICON[tone]} size={18} strokeWidth={2.2} /></span>
      <div className={styles.toastText}>
        <p className={styles.toastTitle}>{title}</p>
        {body !== undefined && <p className={styles.toastBody}>{body}</p>}
      </div>
      {action}
      {dismissLabel !== undefined && onDismiss !== undefined && (
        <IconButton size="s" label={dismissLabel} icon={<UiIcon name="close" size={18} />} onClick={onDismiss} />
      )}
    </div>
  )
}

/** Fixed bottom-right stack for toasts (polite live region). */
export function ToastRegion({ children, label }: { readonly children: ReactNode; readonly label: string }): ReactNode {
  return (
    <section className={styles.toastRegion} aria-label={label} data-persona-root="">
      {children}
    </section>
  )
}

export interface TooltipProps {
  readonly content: ReactNode
  readonly children: ReactNode
  readonly side?: 'top' | 'bottom'
}

/** Hover/focus tooltip (400 ms delay). Never put actions inside. */
export function Tooltip({ content, children, side = 'top' }: TooltipProps): ReactNode {
  const id = useId()
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = (): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setOpen(true) }, 400)
  }
  const hide = (): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    setOpen(false)
  }
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  return (
    <span
      className={styles.tooltipAnchor}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span id={id} role="tooltip" className={styles.tooltip} data-side={side}>
          {content}
        </span>
      )}
    </span>
  )
}

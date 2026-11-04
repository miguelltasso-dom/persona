/** Card overflow menu: move, open, request status (keyboard: ↑↓ Enter Esc). */

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconButton, UiIcon } from '../primitives/index.ts'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { KANBAN_COLUMN_ORDER, type KanbanColumnId } from './types.ts'
import styles from './Kanban.module.css'

export interface FlowMoveTarget {
  readonly id: string
  readonly label: string
}

export interface KanbanCardMenuProps {
  readonly dict: LocaleDict
  readonly currentColumn: KanbanColumnId
  readonly columnLabels: Readonly<Record<KanbanColumnId, string>>
  readonly canOpenReview: boolean
  readonly onMove: (toColumn: KanbanColumnId) => void
  readonly flowMoveTargets?: readonly FlowMoveTarget[]
  readonly currentFlowColumnId?: string
  readonly onMoveFlowColumn?: (columnId: string) => void
  readonly onOpen?: () => void
  readonly onRequestStatus?: () => void
}

type MenuEntry =
  | { readonly kind: 'move'; readonly column: KanbanColumnId }
  | { readonly kind: 'moveFlow'; readonly columnId: string; readonly label: string }
  | { readonly kind: 'open' }
  | { readonly kind: 'status' }

export function KanbanCardMenu({
  dict,
  currentColumn,
  columnLabels,
  canOpenReview,
  onMove,
  flowMoveTargets,
  currentFlowColumnId,
  onMoveFlowColumn,
  onOpen,
  onRequestStatus,
}: KanbanCardMenuProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const menuId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)

  const entries: MenuEntry[] = []
  if (flowMoveTargets !== undefined && flowMoveTargets.length > 0) {
    for (const target of flowMoveTargets) {
      if (target.id !== currentFlowColumnId) {
        entries.push({ kind: 'moveFlow', columnId: target.id, label: target.label })
      }
    }
  } else {
    for (const column of KANBAN_COLUMN_ORDER) {
      if (column !== currentColumn) entries.push({ kind: 'move', column })
    }
  }
  if (canOpenReview && onOpen !== undefined) entries.push({ kind: 'open' })
  if (onRequestStatus !== undefined) entries.push({ kind: 'status' })

  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    setFocusIndex(0)
    const onDocPointer = (event: MouseEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', onDocPointer)
    return () => { document.removeEventListener('mousedown', onDocPointer) }
  }, [open, close])

  const activate = (entry: MenuEntry): void => {
    if (entry.kind === 'move') onMove(entry.column)
    else if (entry.kind === 'moveFlow') onMoveFlowColumn?.(entry.columnId)
    else if (entry.kind === 'open') onOpen?.()
    else onRequestStatus?.()
    close()
  }

  const onTriggerKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(true)
    }
  }

  const onPanelKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (entries.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocusIndex(i => (i + 1) % entries.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocusIndex(i => (i - 1 + entries.length) % entries.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setFocusIndex(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setFocusIndex(entries.length - 1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const entry = entries[focusIndex]
      if (entry !== undefined) activate(entry)
    }
  }

  const labelFor = (entry: MenuEntry): string => {
    if (entry.kind === 'move') return t('action.moveTo', { column: columnLabels[entry.column] })
    if (entry.kind === 'moveFlow') return t('action.moveTo', { column: entry.label })
    if (entry.kind === 'open') return t('action.open')
    return t('action.requestStatus')
  }

  return (
    <div className={styles.cardMenuWrap} onMouseDown={(event) => { event.stopPropagation() }}>
      <IconButton
        ref={triggerRef}
        size="s"
        label={t('a11y.cardMenu')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        icon={<UiIcon name="more" size={18} />}
        onClick={() => { setOpen(value => !value) }}
        onKeyDown={onTriggerKeyDown}
      />
      {open && entries.length > 0 && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          className={styles.cardMenu}
          aria-label={t('a11y.cardMenu')}
          onKeyDown={onPanelKeyDown}
        >
          {entries.map((entry, index) => (
            <button
              key={entry.kind === 'move' ? `move-${entry.column}` : entry.kind === 'moveFlow' ? `flow-${entry.columnId}` : entry.kind}
              type="button"
              role="menuitem"
              className={styles.cardMenuItem}
              tabIndex={index === focusIndex ? 0 : -1}
              ref={(node) => {
                if (index === focusIndex) node?.focus()
              }}
              onClick={() => { activate(entry) }}
            >
              {(entry.kind === 'move' || entry.kind === 'moveFlow') && (
                <UiIcon name="arrowRight" size={16} strokeWidth={2} className={styles.cardMenuIcon} />
              )}
              {labelFor(entry)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

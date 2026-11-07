/** Segundo cérebro › ⋯: Exportar para uma pasta / Importar de uma pasta (SB-4). Only the installed app has a folder picker. */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { IconButton, UiIcon } from '../primitives/index.ts'
import styles from './VaultFolderMenu.module.css'

export interface VaultFolderMenuProps {
  readonly dict: LocaleDict
  /** The native folder picker exists (installed app). On the web both items are disabled and say why. */
  readonly available: boolean
  readonly onExport?: (() => void) | undefined
  readonly onImport?: (() => void) | undefined
}

export function VaultFolderMenu({ dict, available, onExport, onImport }: VaultFolderMenuProps): ReactNode {
  /** The same words if this build's generated locale does not carry the keys yet. */
  const t = (key: string, fallback: string): string => {
    const text = bindLocale(dict, key)
    return text === key ? fallback : text
  }
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: MouseEvent): void => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const items: readonly { readonly id: string; readonly label: string; readonly run: (() => void) | undefined }[] = [
    { id: 'export', label: t('menu.export', 'Exportar para uma pasta'), run: onExport },
    { id: 'import', label: t('menu.import', 'Importar de uma pasta'), run: onImport },
  ]

  return (
    <div className={styles.root} ref={rootRef}>
      <IconButton
        size="m"
        label={t('menu.more', 'Mais ações')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        icon={<UiIcon name="more" size={20} />}
        onClick={() => { setOpen(value => !value) }}
      />
      {open && (
        <div id={menuId} role="menu" className={styles.menu}>
          {items.map(item => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={styles.item}
              disabled={!available || item.run === undefined}
              onClick={() => { setOpen(false); item.run?.() }}
            >
              {item.label}
            </button>
          ))}
          {!available && <p className={styles.note} role="note">{t('menu.desktopOnly', 'Só funciona no app instalado.')}</p>}
        </div>
      )}
    </div>
  )
}

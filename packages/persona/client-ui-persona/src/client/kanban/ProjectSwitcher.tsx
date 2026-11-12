/** O seletor "Pessoal ▾" do cabeçalho do lugar Projetos (DESIGN-01-MUSE §5.1 #1/#2): troca de projeto sem sair da aba. */

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'
import { UiIcon } from '../primitives/index.ts'
import type { ProjectChoice } from './current-project.ts'
import styles from './ProjectSwitcher.module.css'

export interface ProjectSwitcherProps {
  readonly dict: LocaleDict
  readonly projects: readonly ProjectChoice[]
  /** The project the place is showing; null = none (the button says "Projetos"). */
  readonly currentId: string | null
  readonly onSelect: (projectId: string) => void
  /** "Ver todos os projetos": the grid of cards. */
  readonly onSeeAll: () => void
  /** "Novo projeto": the last project action of the menu. Absent = no item. */
  readonly onNewProject?: (() => void) | undefined
}

const ITEMS = '[role="menuitemradio"], [role="menuitem"]'

/**
 * A menu button in the pattern of `MenuButton` (aria-haspopup, arrows/Home/End, Esc returns focus, Tab or a click outside closes), with a
 * text label: the name of the project of the moment. The menu lists the projects (the current one checked) and ends with "Ver todos os projetos".
 */
export function ProjectSwitcher({ dict, projects, currentId, onSelect, onSeeAll, onNewProject }: ProjectSwitcherProps): ReactNode {
  const t = (key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(dict, key, params)
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const current = projects.find(project => project.id === currentId)
  const label = current?.name ?? t('projects.switcher.title')

  useEffect(() => {
    if (!open) return undefined
    listRef.current?.querySelector<HTMLElement>(ITEMS)?.focus()
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
    const nodes = [...(listRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])]
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
    <div className={styles.wrap} ref={wrapRef} data-persona-project-switcher="">
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={current === undefined ? label : t('projects.switcher.aria', { name: label })}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className={styles.name}>{label}</span>
        <UiIcon name="chevronDown" size={20} strokeWidth={2.4} className={styles.chevron} />
      </button>
      {open && (
        <ul id={menuId} role="menu" ref={listRef} aria-label={t('projects.switcher.title')} className={styles.menu} onKeyDown={onKeyDown}>
          {projects.map(project => (
            <li key={project.id} role="none">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={project.id === currentId}
                className={styles.item}
                onClick={() => {
                  setOpen(false)
                  if (project.id !== currentId) onSelect(project.id)
                  buttonRef.current?.focus()
                }}
              >
                <span className={styles.check} aria-hidden="true">{project.id === currentId && <UiIcon name="check" size={16} strokeWidth={2.6} />}</span>
                {project.name}
              </button>
            </li>
          ))}
          <li role="none" className={styles.divider} />
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={`${styles.item} ${styles.seeAll}`}
              onClick={() => {
                setOpen(false)
                onSeeAll()
              }}
            >
              {t('projects.switcher.seeAll')}
            </button>
          </li>
          {onNewProject !== undefined && (
            <li role="none">
              <button
                type="button"
                role="menuitem"
                className={`${styles.item} ${styles.seeAll}`}
                onClick={() => {
                  setOpen(false)
                  onNewProject()
                }}
              >
                <span className={styles.check} aria-hidden="true"><UiIcon name="plus" size={16} strokeWidth={2.6} /></span>
                {t('boards.newProject')}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

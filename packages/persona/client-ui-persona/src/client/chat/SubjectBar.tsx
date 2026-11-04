/**
 * Assuntos da conversa (WAVE2 §1, WAVE2-SPEC (a)) — presentation by Muse, data by Prism.
 * Pills with dot + name (never color alone), unread bubble, "persona working" ring, ⋯ (rename / archive /
 * reopen archived) and "+ Novo assunto" outside the tablist (valid ARIA), inline rename at the bar's end.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { IconButton, MenuButton, UiIcon, type MenuButtonHandle, type MenuItem } from '../primitives/index.ts'
import type { ConversationSubjectUi } from './conversation-subjects.ts'
import { SUBJECT_COLOR_COUNT, subjectColorVar } from './conversation-subjects.ts'
import styles from './SubjectBar.module.css'

export interface SubjectBarProps extends PropsLocale<'persona.chat'> {
  readonly subjects: readonly ConversationSubjectUi[]
  readonly activeSubjectId: string
  readonly onSelect: (subjectId: string) => void
  /** "+ Novo assunto": Prism creates with the next free color, then passes its id as `editingSubjectId`. */
  readonly onCreate?: (() => void) | undefined
  readonly onRename?: ((subjectId: string, name: string) => void) | undefined
  readonly onArchive?: ((subjectId: string) => void) | undefined
  readonly archived?: readonly ConversationSubjectUi[] | undefined
  readonly onReopen?: ((subjectId: string) => void) | undefined
  /** Opens the inline name field for this subject (e.g. right after creating it). */
  readonly editingSubjectId?: string | undefined
  readonly onCompleteSubject?: ((subjectId: string) => void) | undefined
  readonly onSnoozeSubject?: ((subjectId: string, kind: '3h' | 'tomorrow' | 'monday') => void) | undefined
}

const NAME_MAX = 24

/** Visible name: the given name, or the color's name ("Lilás") — a subject is never just a color. */
export function subjectDisplayName(t: PropsLocale<'persona.chat'>['t'], subject: ConversationSubjectUi): string {
  const name = subject.name.trim()
  return name.length > 0 ? name : t(`subjects.color${subject.colorIndex}`)
}

/** The subject dot: fill = subject color, 1.5px plum outline (non-text contrast), optional working ring. */
export function SubjectDot({ colorIndex, working = false, size = 12 }: {
  readonly colorIndex: ConversationSubjectUi['colorIndex']
  readonly working?: boolean
  readonly size?: number
}): ReactNode {
  return (
    <span
      className={working ? `${styles.dot} ${styles.working}` : styles.dot}
      style={{ background: subjectColorVar(colorIndex), color: subjectColorVar(colorIndex), width: size, height: size }}
      aria-hidden="true"
    />
  )
}

export function SubjectBar({
  t,
  subjects,
  activeSubjectId,
  onSelect,
  onCreate,
  onRename,
  onArchive,
  archived = [],
  onReopen,
  editingSubjectId,
  onCompleteSubject,
  onSnoozeSubject,
}: SubjectBarProps): ReactNode {
  const tabsRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<MenuButtonHandle>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [overflow, setOverflow] = useState(false)
  const renameRef = useRef<HTMLInputElement>(null)
  const active = subjects.find(subject => subject.id === activeSubjectId)

  useEffect(() => {
    if (editingSubjectId === undefined) return
    setEditing(editingSubjectId)
    setDraft(subjects.find(item => item.id === editingSubjectId)?.name ?? '')
    // Only when Prism hands a new id; `subjects` changes on every message.
  }, [editingSubjectId])

  useEffect(() => {
    if (editing !== null) renameRef.current?.focus()
  }, [editing])

  useEffect(() => {
    const node = tabsRef.current
    if (node === null || typeof ResizeObserver === 'undefined') return undefined
    const check = (): void => { setOverflow(node.scrollWidth > node.clientWidth + 1) }
    const observer = new ResizeObserver(check)
    observer.observe(node)
    check()
    return () => { observer.disconnect() }
  }, [subjects.length])

  const focusTab = (index: number): void => {
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[index]?.focus()
  }

  const startRename = (subject: ConversationSubjectUi): void => {
    setDraft(subject.name)
    setEditing(subject.id)
  }

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const subject = subjects[index]
    if (event.key === 'F2' && subject !== undefined && subject.id === activeSubjectId && onRename !== undefined) {
      event.preventDefault()
      startRename(subject)
      return
    }
    if (event.key === 'F10' && event.shiftKey) {
      event.preventDefault()
      menuRef.current?.open()
      return
    }
    const last = subjects.length - 1
    const next = event.key === 'ArrowRight' ? (index + 1) % subjects.length
      : event.key === 'ArrowLeft' ? (index - 1 + subjects.length) % subjects.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? last
            : -1
    if (next < 0) return
    event.preventDefault()
    const id = subjects[next]?.id
    if (id === undefined) return
    onSelect(id)
    tabsRef.current?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next]?.focus()
  }, [activeSubjectId, onRename, onSelect, subjects])

  if (subjects.length === 0) return null

  const finishRename = (save: boolean): void => {
    const name = draft.trim().slice(0, NAME_MAX)
    if (save && editing !== null && onRename !== undefined) onRename(editing, name)
    const index = subjects.findIndex(subject => subject.id === editing)
    setEditing(null)
    requestAnimationFrame(() => { focusTab(index < 0 ? 0 : index) })
  }

  const menuItems: MenuItem[] = []
  if (active !== undefined && onRename !== undefined) {
    menuItems.push({ id: 'rename', label: t('subjects.rename'), onSelect: () => { startRename(active) } })
  }
  if (active !== undefined && onArchive !== undefined && subjects.length > 1) {
    menuItems.push({ id: 'archive', label: t('subjects.archive'), onSelect: () => { onArchive(active.id) } })
  }
  if (active !== undefined && onCompleteSubject !== undefined) {
    menuItems.push({ id: 'complete', label: t('subjects.complete'), onSelect: () => { onCompleteSubject(active.id) } })
  }
  if (active !== undefined && onSnoozeSubject !== undefined) {
    menuItems.push({ id: 'snooze-3h', label: t('subjects.snooze3h'), onSelect: () => { onSnoozeSubject(active.id, '3h') } })
    menuItems.push({ id: 'snooze-tomorrow', label: t('subjects.snoozeTomorrow'), onSelect: () => { onSnoozeSubject(active.id, 'tomorrow') } })
    menuItems.push({ id: 'snooze-monday', label: t('subjects.snoozeMonday'), onSelect: () => { onSnoozeSubject(active.id, 'monday') } })
  }
  if (onReopen !== undefined) {
    for (const subject of archived) {
      menuItems.push({
        id: `reopen-${subject.id}`,
        label: t('subjects.reopen', { name: subjectDisplayName(t, subject) }),
        leading: <SubjectDot colorIndex={subject.colorIndex} size={10} />,
        onSelect: () => { onReopen(subject.id) },
      })
    }
  }
  const full = subjects.length >= SUBJECT_COLOR_COUNT
  const editingSubject = subjects.find(subject => subject.id === editing)

  return (
    <div className={styles.bar}>
      <div
        ref={tabsRef}
        className={styles.tabs}
        data-overflow={overflow ? '' : undefined}
        role="tablist"
        aria-label={t('subjects.barLabel')}
      >
        {subjects.map((subject, index) => {
          const selected = subject.id === activeSubjectId
          const name = subjectDisplayName(t, subject)
          const working = subject.working === true
          const workingText = working
            ? t('subjects.working', { name: subject.workingName ?? t('subjects.someone') })
            : undefined
          const unread = !selected && subject.unreadCount > 0
          return (
            <button
              key={subject.id}
              type="button"
              role="tab"
              id={`persona-subject-${subject.id}`}
              aria-selected={selected}
              aria-controls="persona-subject-panel"
              aria-keyshortcuts={selected && menuItems.length > 0 ? 'Shift+F10' : undefined}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              data-unread={unread ? '' : undefined}
              style={{ ['--subject-tint' as string]: `var(--persona-subject-${subject.colorIndex}-tint)` }}
              title={workingText ?? name}
              onClick={() => { onSelect(subject.id) }}
              onKeyDown={(event) => { onKeyDown(event, index) }}
            >
              <SubjectDot colorIndex={subject.colorIndex} working={working} />
              <span className={styles.label}>{name}</span>
              {unread && (
                <>
                  <span className={styles.unread} aria-hidden="true">{subject.unreadCount > 9 ? '9+' : subject.unreadCount}</span>
                  <span className={styles.srOnly}>{t('subjects.unread', { count: String(subject.unreadCount) })}</span>
                </>
              )}
              {workingText !== undefined && <span className={styles.srOnly}>{workingText}</span>}
            </button>
          )
        })}
      </div>

      {editingSubject !== undefined ? (
        <form className={styles.rename} onSubmit={(event) => { event.preventDefault(); finishRename(true) }}>
          <SubjectDot colorIndex={editingSubject.colorIndex} />
          <input
            ref={renameRef}
            className={styles.renameField}
            value={draft}
            maxLength={NAME_MAX}
            placeholder={subjectDisplayName(t, { ...editingSubject, name: '' })}
            aria-label={t('subjects.nameLabel')}
            onChange={(event) => { setDraft(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              event.preventDefault()
              event.stopPropagation()
              finishRename(false)
            }}
          />
          <IconButton type="submit" size="s" variant="primary" label={t('subjects.save')} icon={<UiIcon name="check" size={16} strokeWidth={2.4} />} />
        </form>
      ) : (
        <div className={styles.actions}>
          {menuItems.length > 0 && active !== undefined && (
            <MenuButton
              ref={menuRef}
              label={t('subjects.more', { name: subjectDisplayName(t, active) })}
              items={menuItems}
              variant="ghost"
            />
          )}
          {onCreate !== undefined && (
            <IconButton
              size="s"
              variant="ghost"
              label={full ? t('subjects.addFull') : t('subjects.add')}
              title={full ? t('subjects.addFull') : t('subjects.add')}
              disabled={full}
              icon={<UiIcon name="plus" size={16} strokeWidth={2.4} />}
              onClick={onCreate}
            />
          )}
        </div>
      )}
    </div>
  )
}

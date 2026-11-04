import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import {
  DEFAULT_CONVERSATION_SUBJECT_ID,
  DEFAULT_CONVERSATION_SUBJECTS,
  SUBJECT_COLOR_COUNT,
  filterMessagesForSubject,
  type ConversationSubjectUi,
  type SubjectColorIndex,
} from './conversation-subjects.ts'
import { applySubjectOverrides, effectiveSubjectId } from './message-subject-overrides.ts'

const ACTIVE_STORAGE = 'persona.subject.active.v1'
const LIST_STORAGE = 'persona.subject.list.v1'
const ARCHIVED_STORAGE = 'persona.subject.archived.v1'

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

function readActiveSubject(streamKey: string): string | null {
  try {
    return sessionStorage.getItem(`${ACTIVE_STORAGE}:${streamKey}`)
  } catch {
    return null
  }
}

function writeActiveSubject(streamKey: string, subjectId: string): void {
  try {
    sessionStorage.setItem(`${ACTIVE_STORAGE}:${streamKey}`, subjectId)
  } catch {
    /* private mode */
  }
}

/** Next palette slot not used by active or archived subjects (WAVE2 max 7). */
export function nextFreeSubjectColorIndex(
  subjects: readonly ConversationSubjectUi[],
  archived: readonly ConversationSubjectUi[],
): SubjectColorIndex | null {
  const used = new Set<number>([...subjects, ...archived].map(row => row.colorIndex))
  for (let i = 0; i < SUBJECT_COLOR_COUNT; i += 1) {
    if (!used.has(i)) return i as SubjectColorIndex
  }
  return null
}

function countUnread(
  messages: readonly ChannelMessageUi[],
  subjectId: string,
  overrides: Readonly<Record<string, string>>,
): number {
  return messages.filter(row => effectiveSubjectId(row, overrides) === subjectId).length
}

function withUnread(
  subjects: readonly ConversationSubjectUi[],
  messages: readonly ChannelMessageUi[],
  activeSubjectId: string,
  overrides: Readonly<Record<string, string>>,
): ConversationSubjectUi[] {
  return subjects.map((row) => {
    const unread = row.id === activeSubjectId ? 0 : countUnread(messages, row.id, overrides)
    return unread === row.unreadCount ? row : { ...row, unreadCount: unread }
  })
}

/** Client-side assuntos until Anvil persists `listConversationSubjects`. */
export function useConversationSubjects(
  streamKey: string,
  messages: readonly ChannelMessageUi[],
  overrides: Readonly<Record<string, string>> = {},
): {
  readonly subjects: readonly ConversationSubjectUi[]
  readonly archived: readonly ConversationSubjectUi[]
  readonly activeSubjectId: string
  readonly activeSubject: ConversationSubjectUi
  readonly filteredMessages: readonly ChannelMessageUi[]
  readonly editingSubjectId: string | undefined
  readonly selectSubject: (subjectId: string) => void
  readonly createSubject: () => void
  readonly renameSubject: (subjectId: string, name: string) => void
  readonly archiveSubject: (subjectId: string) => void
  readonly reopenSubject: (subjectId: string) => void
} {
  const listKey = `${LIST_STORAGE}:${streamKey}`
  const archivedKey = `${ARCHIVED_STORAGE}:${streamKey}`

  const [subjects, setSubjects] = useState<readonly ConversationSubjectUi[]>(() =>
    readJson(listKey, [...DEFAULT_CONVERSATION_SUBJECTS]),
  )
  const [archived, setArchived] = useState<readonly ConversationSubjectUi[]>(() =>
    readJson(archivedKey, []),
  )
  const [activeSubjectId, setActiveSubjectId] = useState(() =>
    readActiveSubject(streamKey) ?? DEFAULT_CONVERSATION_SUBJECT_ID,
  )
  const [editingSubjectId, setEditingSubjectId] = useState<string | undefined>(undefined)

  useEffect(() => { writeJson(listKey, subjects) }, [listKey, subjects])
  useEffect(() => { writeJson(archivedKey, archived) }, [archivedKey, archived])

  const selectSubject = useCallback((subjectId: string) => {
    setActiveSubjectId(subjectId)
    writeActiveSubject(streamKey, subjectId)
  }, [streamKey])

  const createSubject = useCallback(() => {
    if (subjects.length >= SUBJECT_COLOR_COUNT) return
    const colorIndex = nextFreeSubjectColorIndex(subjects, archived)
    if (colorIndex === null) return
    const id = `subject-${Date.now()}`
    const row: ConversationSubjectUi = { id, name: '', colorIndex, unreadCount: 0 }
    setSubjects(current => [...current, row])
    selectSubject(id)
    setEditingSubjectId(id)
  }, [archived, selectSubject, subjects.length])

  const renameSubject = useCallback((subjectId: string, name: string) => {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setSubjects(current => current.map(row => row.id === subjectId ? { ...row, name: trimmed.slice(0, 24) } : row))
    setEditingSubjectId(current => (current === subjectId ? undefined : current))
  }, [])

  const archiveSubject = useCallback((subjectId: string) => {
    if (subjectId === DEFAULT_CONVERSATION_SUBJECT_ID) return
    setSubjects((current) => {
      const row = current.find(item => item.id === subjectId)
      if (row === undefined) return current
      setArchived(prev => [...prev, { ...row, unreadCount: 0 }])
      const next = current.filter(item => item.id !== subjectId)
      if (activeSubjectId === subjectId) {
        selectSubject(DEFAULT_CONVERSATION_SUBJECT_ID)
      }
      return next
    })
  }, [activeSubjectId, selectSubject])

  const reopenSubject = useCallback((subjectId: string) => {
    if (subjects.length >= SUBJECT_COLOR_COUNT) return
    setArchived((current) => {
      const row = current.find(item => item.id === subjectId)
      if (row === undefined) return current
      setSubjects(prev => [...prev, { ...row, unreadCount: 0 }])
      selectSubject(subjectId)
      return current.filter(item => item.id !== subjectId)
    })
  }, [selectSubject, subjects.length])

  const subjectsWithUnread = useMemo(
    () => withUnread(subjects, messages, activeSubjectId, overrides),
    [activeSubjectId, messages, overrides, subjects],
  )

  const activeSubject = subjectsWithUnread.find(row => row.id === activeSubjectId)
    ?? subjectsWithUnread[0]
    ?? DEFAULT_CONVERSATION_SUBJECTS[0]!

  const filteredMessages = useMemo(
    () => filterMessagesForSubject(applySubjectOverrides(messages, overrides), activeSubjectId),
    [activeSubjectId, messages, overrides],
  )

  return {
    subjects: subjectsWithUnread,
    archived,
    activeSubjectId,
    activeSubject,
    filteredMessages,
    editingSubjectId,
    selectSubject,
    createSubject,
    renameSubject,
    archiveSubject,
    reopenSubject,
  }
}

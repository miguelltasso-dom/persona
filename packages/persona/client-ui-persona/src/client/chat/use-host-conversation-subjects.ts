import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConversationSubjectScope } from '@deepseek-ai/dsh-persona-host/types'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import {
  DEFAULT_CONVERSATION_SUBJECTS,
  DEFAULT_CONVERSATION_SUBJECT_ID,
  filterMessagesForSubject,
  type ConversationSubjectUi,
} from './conversation-subjects.ts'

/** WAVE2 assuntos via Forge Typert RPC (list/create/rename/archive/move/setActive). */
export function useHostConversationSubjects(
  live: PersonaLiveStore,
  scope: ConversationSubjectScope | null,
  messages: readonly ChannelMessageUi[],
): {
  readonly ready: boolean
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
  readonly moveMessageToSubject: (messageId: string, subjectId: string) => void
} {
  const [subjects, setSubjects] = useState<readonly ConversationSubjectUi[]>(DEFAULT_CONVERSATION_SUBJECTS)
  const [archived, setArchived] = useState<readonly ConversationSubjectUi[]>([])
  const [activeSubjectId, setActiveSubjectId] = useState(DEFAULT_CONVERSATION_SUBJECT_ID)
  const [editingSubjectId, setEditingSubjectId] = useState<string | undefined>(undefined)
  const [ready, setReady] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (scope === null) {
      setReady(false)
      return
    }
    const bundle = await live.fetchConversationSubjects(scope)
    setSubjects(bundle.subjects)
    setActiveSubjectId(bundle.activeSubjectId)
    setReady(true)
  }, [live, scope])

  useEffect(() => {
    void load()
  }, [load])

  const selectSubject = useCallback((subjectId: string) => {
    if (scope === null) return
    void live.selectConversationSubject(scope, subjectId).then((bundle) => {
      setSubjects(bundle.subjects)
      setActiveSubjectId(bundle.activeSubjectId)
    })
  }, [live, scope])

  const createSubject = useCallback(() => {
    if (scope === null) return
    void live.createConversationSubject(scope, '').then(({ bundle, createdSubjectId }) => {
      setSubjects(bundle.subjects)
      setActiveSubjectId(bundle.activeSubjectId)
      setEditingSubjectId(createdSubjectId)
    })
  }, [live, scope])

  const renameSubject = useCallback((subjectId: string, name: string) => {
    if (scope === null) return
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    void live.renameConversationSubject(scope, subjectId, trimmed).then((bundle) => {
      setSubjects(bundle.subjects)
      setActiveSubjectId(bundle.activeSubjectId)
      setEditingSubjectId(current => (current === subjectId ? undefined : current))
    })
  }, [live, scope])

  const archiveSubject = useCallback((subjectId: string) => {
    if (scope === null) return
    const row = subjects.find(item => item.id === subjectId)
    void live.archiveConversationSubject(scope, subjectId).then((bundle) => {
      if (row !== undefined) setArchived(prev => [...prev, { ...row, unreadCount: 0 }])
      setSubjects(bundle.subjects)
      setActiveSubjectId(bundle.activeSubjectId)
    })
  }, [live, scope, subjects])

  const reopenSubject = useCallback((subjectId: string) => {
    if (scope === null) return
    const row = archived.find(item => item.id === subjectId)
    if (row === undefined) return
    void live.reopenConversationSubject(scope, row.name, row.colorIndex).then((bundle) => {
      setArchived(prev => prev.filter(item => item.id !== subjectId))
      setSubjects(bundle.subjects)
      setActiveSubjectId(bundle.activeSubjectId)
      selectSubject(bundle.activeSubjectId)
    })
  }, [archived, live, scope, selectSubject])

  const moveMessageToSubject = useCallback((messageId: string, subjectId: string) => {
    if (scope === null) return
    void live.moveMessageToSubject(scope, messageId, subjectId)
  }, [live, scope])

  const activeSubject = subjects.find(row => row.id === activeSubjectId)
    ?? subjects[0]
    ?? DEFAULT_CONVERSATION_SUBJECTS[0]!

  const filteredMessages = useMemo(
    () => filterMessagesForSubject(messages, activeSubjectId),
    [activeSubjectId, messages],
  )

  return {
    ready,
    subjects,
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
    moveMessageToSubject,
  }
}

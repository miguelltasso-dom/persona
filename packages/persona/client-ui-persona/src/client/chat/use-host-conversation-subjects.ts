import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChannelMessageUi } from '../remote/map-host-ui.ts'
import type { PersonaLiveStore } from '../remote/persona-live-store.ts'
import { PersonaRemoteError } from '../remote/persona-remote-unwrap.ts'
import {
  DEFAULT_CONVERSATION_SUBJECTS,
  DEFAULT_CONVERSATION_SUBJECT_ID,
  filterMessagesForSubject,
  type ConversationSubjectUi,
} from './conversation-subjects.ts'

/** WAVE2 assuntos via Forge Typert RPC (list/create/rename/archive/move/setActive). */
export function useHostConversationSubjects(
  live: PersonaLiveStore,
  streamKey: string | null,
  messages: readonly ChannelMessageUi[],
): {
  readonly ready: boolean
  readonly subjects: readonly ConversationSubjectUi[]
  readonly archived: readonly ConversationSubjectUi[]
  readonly activeSubjectId: string
  readonly activeSubject: ConversationSubjectUi
  readonly filteredMessages: readonly ChannelMessageUi[]
  readonly editingSubjectId: string | undefined
  readonly subjectsError: PersonaRemoteError | null
  readonly retrySubjects: () => void
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
  const [subjectsError, setSubjectsError] = useState<PersonaRemoteError | null>(null)

  const scope = useMemo(
    () => (streamKey === null ? null : live.conversationScopeFromKey(streamKey)),
    [live, streamKey],
  )

  const applyBundle = useCallback((bundle: { readonly subjects: readonly ConversationSubjectUi[]; readonly activeSubjectId: string }) => {
    setSubjects(bundle.subjects)
    setActiveSubjectId(bundle.activeSubjectId)
    setSubjectsError(null)
    setReady(true)
  }, [])

  const onRemoteFailure = useCallback((error: unknown): void => {
    setSubjectsError(error instanceof PersonaRemoteError ? error : null)
  }, [])

  useEffect(() => {
    if (streamKey === null) {
      setReady(false)
      setSubjectsError(null)
      return
    }
    const rowScope = live.conversationScopeFromKey(streamKey)
    if (rowScope === null) {
      setReady(false)
      return
    }
    let cancelled = false
    void live.fetchConversationSubjects(rowScope).then((bundle) => {
      if (cancelled) return
      setSubjects(bundle.subjects)
      setActiveSubjectId(bundle.activeSubjectId)
      setSubjectsError(null)
      setReady(true)
    }).catch((error: unknown) => {
      if (cancelled) return
      setReady(false)
      setSubjectsError(error instanceof PersonaRemoteError ? error : null)
    })
    return () => { cancelled = true }
  }, [live, streamKey])

  const retrySubjects = useCallback(() => {
    if (scope === null) return
    setReady(false)
    void live.fetchConversationSubjects(scope, { force: true }).then(applyBundle).catch(onRemoteFailure)
  }, [applyBundle, live, onRemoteFailure, scope])

  const selectSubject = useCallback((subjectId: string) => {
    if (scope === null) return
    void live.selectConversationSubject(scope, subjectId).then(applyBundle).catch(onRemoteFailure)
  }, [applyBundle, live, onRemoteFailure, scope])

  const createSubject = useCallback(() => {
    if (scope === null) return
    void live.createConversationSubject(scope, '').then(({ bundle, createdSubjectId }) => {
      applyBundle(bundle)
      setEditingSubjectId(createdSubjectId)
    }).catch(onRemoteFailure)
  }, [applyBundle, live, onRemoteFailure, scope])

  const renameSubject = useCallback((subjectId: string, name: string) => {
    if (scope === null) return
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    void live.renameConversationSubject(scope, subjectId, trimmed).then((bundle) => {
      applyBundle(bundle)
      setEditingSubjectId(current => (current === subjectId ? undefined : current))
    }).catch(onRemoteFailure)
  }, [applyBundle, live, onRemoteFailure, scope])

  const archiveSubject = useCallback((subjectId: string) => {
    if (scope === null) return
    const row = subjects.find(item => item.id === subjectId)
    void live.archiveConversationSubject(scope, subjectId).then((bundle) => {
      if (row !== undefined) setArchived(prev => [...prev, { ...row, unreadCount: 0 }])
      applyBundle(bundle)
    }).catch(onRemoteFailure)
  }, [applyBundle, live, onRemoteFailure, scope, subjects])

  const reopenSubject = useCallback((subjectId: string) => {
    if (scope === null) return
    const row = archived.find(item => item.id === subjectId)
    if (row === undefined) return
    void live.reopenConversationSubject(scope, row.name, row.colorIndex).then((bundle) => {
      setArchived(prev => prev.filter(item => item.id !== subjectId))
      applyBundle(bundle)
      selectSubject(bundle.activeSubjectId)
    }).catch(onRemoteFailure)
  }, [applyBundle, archived, live, onRemoteFailure, scope, selectSubject])

  const moveMessageToSubject = useCallback((messageId: string, subjectId: string) => {
    if (scope === null) return
    void live.moveMessageToSubject(scope, messageId, subjectId).catch(onRemoteFailure)
  }, [live, onRemoteFailure, scope])

  const activeSubject = subjects.find(row => row.id === activeSubjectId)
    ?? subjects[0]
    ?? DEFAULT_CONVERSATION_SUBJECTS[0]!

  const filteredMessages = useMemo(() => {
    const primary = filterMessagesForSubject(messages, activeSubjectId)
    if (primary.length > 0 || messages.length === 0) return primary
    if (activeSubjectId !== DEFAULT_CONVERSATION_SUBJECT_ID) {
      return filterMessagesForSubject(messages, DEFAULT_CONVERSATION_SUBJECT_ID)
    }
    return primary
  }, [activeSubjectId, messages])

  return {
    ready,
    subjects,
    archived,
    activeSubjectId,
    activeSubject,
    filteredMessages,
    editingSubjectId,
    subjectsError,
    retrySubjects,
    selectSubject,
    createSubject,
    renameSubject,
    archiveSubject,
    reopenSubject,
    moveMessageToSubject,
  }
}

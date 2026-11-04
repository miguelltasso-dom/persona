import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PersonaRemoteClient } from '../data/lumen-inject.ts'
import { unwrapRemote } from '../data/remote-call.ts'
import {
  DEFAULT_CONVERSATION_SUBJECTS,
  DEFAULT_CONVERSATION_SUBJECT_ID,
  type ConversationSubjectUi,
} from './conversation-subjects.ts'

export interface ConversationSubjectsSnapshot {
  readonly subjects: readonly ConversationSubjectUi[]
  readonly activeSubjectId: string
}

export interface ConversationSubjectScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
}

interface ListConversationSubjectsRow {
  readonly id: string
  readonly name: string
  readonly colorIndex: number
  readonly unreadCount?: number
  readonly workingPersonaIds?: readonly string[]
}

interface ListConversationSubjectsValue {
  readonly subjects: readonly ListConversationSubjectsRow[]
  readonly activeSubjectId: string
}

/** Host `listConversationSubjects` when Typert exposes it; else WAVE2 default pack. */
export async function loadConversationSubjects(
  client: PersonaRemoteClient,
  scope: ConversationSubjectScope,
): Promise<ConversationSubjectsSnapshot> {
  if (!('listConversationSubjects' in client) || typeof client.listConversationSubjects !== 'function') {
    return { subjects: DEFAULT_CONVERSATION_SUBJECTS, activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID }
  }
  try {
    const row = await unwrapRemote(
      (await client.listConversationSubjects(scope)) as RemoteResult<ListConversationSubjectsValue>,
    )
    const subjects: ConversationSubjectUi[] = row.subjects.map((item: ListConversationSubjectsRow) => {
      const colorIndex = item.colorIndex as ConversationSubjectUi['colorIndex']
      const base: ConversationSubjectUi = {
        id: item.id,
        name: item.name,
        colorIndex,
        unreadCount: item.unreadCount ?? 0,
      }
      if (item.workingPersonaIds === undefined || item.workingPersonaIds.length === 0) return base
      return { ...base, working: true }
    })
    return {
      subjects: subjects.length > 0 ? subjects : DEFAULT_CONVERSATION_SUBJECTS,
      activeSubjectId: row.activeSubjectId.length > 0 ? row.activeSubjectId : DEFAULT_CONVERSATION_SUBJECT_ID,
    }
  } catch {
    return { subjects: DEFAULT_CONVERSATION_SUBJECTS, activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID }
  }
}

import type {
  ConversationSubjectView,
  ConversationSubjectsBundleView,
} from '@deepseek-ai/dsh-persona-host/types'
import type { ConversationSubjectUi } from './conversation-subjects.ts'

export interface MappedConversationSubjects {
  readonly subjects: readonly ConversationSubjectUi[]
  readonly activeSubjectId: string
}

export function mapConversationSubjectView(row: ConversationSubjectView): ConversationSubjectUi {
  const colorIndex = row.colorIndex as ConversationSubjectUi['colorIndex']
  const base: ConversationSubjectUi = {
    id: row.id,
    name: row.name,
    colorIndex,
    unreadCount: row.unreadCount,
  }
  if (row.workingPersonaIds.length === 0) return base
  const workingName = row.workingPersonaIds[0]
  return workingName === undefined
    ? { ...base, working: true }
    : { ...base, working: true, workingName }
}

export function mapConversationSubjectsBundle(bundle: ConversationSubjectsBundleView): MappedConversationSubjects {
  return {
    subjects: bundle.subjects.filter(row => !row.archived).map(mapConversationSubjectView),
    activeSubjectId: bundle.activeSubjectId,
  }
}

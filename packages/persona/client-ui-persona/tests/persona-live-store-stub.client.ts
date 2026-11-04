import { DEFAULT_CONVERSATION_SUBJECT_ID, DEFAULT_CONVERSATION_SUBJECTS } from '../src/client/chat/conversation-subjects.ts'
import type { PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'

/** No-op Wave2 RPC surface for unit tests that only exercise older live-store methods. */
export const personaLiveStoreWave2Stub: Pick<
  PersonaLiveStore,
  | 'searchMessages'
  | 'conversationScope'
  | 'conversationScopeFromKey'
  | 'fetchConversationSubjects'
  | 'selectConversationSubject'
  | 'createConversationSubject'
  | 'renameConversationSubject'
  | 'archiveConversationSubject'
  | 'reopenConversationSubject'
  | 'moveMessageToSubject'
  | 'startTeachPersona'
  | 'pauseTeachSession'
  | 'resumeTeachSession'
  | 'stopTeachSession'
  | 'getTeachSession'
  | 'getTeachDraft'
  | 'submitTeachDraft'
  | 'approveGestorPlan'
  | 'rejectGestorPlan'
  | 'feedbackGestorPlan'
> = {
  searchMessages: async () => [],
  conversationScope: () => null,
  conversationScopeFromKey: () => null,
  fetchConversationSubjects: async () => ({
    subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
    activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
  }),
  selectConversationSubject: async () => ({
    subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
    activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
  }),
  createConversationSubject: async () => ({
    bundle: {
      subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
      activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
    },
    createdSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
  }),
  renameConversationSubject: async () => ({
    subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
    activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
  }),
  archiveConversationSubject: async () => ({
    subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
    activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
  }),
  reopenConversationSubject: async () => ({
    subjects: [...DEFAULT_CONVERSATION_SUBJECTS],
    activeSubjectId: DEFAULT_CONVERSATION_SUBJECT_ID,
  }),
  moveMessageToSubject: async () => {},
  startTeachPersona: async () => ({ sessionId: '', retentionDays: 30, storageHintPt: '' }),
  pauseTeachSession: async () => ({ status: 'paused', elapsedMs: 0 }),
  resumeTeachSession: async () => ({ status: 'recording', elapsedMs: 0 }),
  stopTeachSession: async () => ({ status: 'processing', elapsedMs: 0 }),
  getTeachSession: async () => ({ status: 'recording', elapsedMs: 0 }),
  getTeachDraft: async () => ({ steps: [], skillTitle: '' }),
  submitTeachDraft: async () => ({ steps: [], skillTitle: '' }),
  approveGestorPlan: async () => {},
  rejectGestorPlan: async () => {},
  feedbackGestorPlan: async () => {},
}

import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MockPersonaDraft, TeamTemplateId } from './mock-data.ts'
import { MOCK_TEMPLATE_ROSTER } from './mock-data.ts'

export interface BuilderMessage {
  readonly id: string
  readonly role: 'user' | 'coordinator'
  readonly body: string
}

export interface OnboardingState {
  readonly step: 1 | 2 | 3 | 4 | 5
  readonly displayName: string
  readonly vaultText: string
  readonly templateId: TeamTemplateId
  readonly builderPrompt: string
  readonly roster: readonly MockPersonaDraft[]
  readonly builderThread: readonly BuilderMessage[]
}

export interface OnboardingActions {
  setDisplayName(name: string): void
  setVaultText(text: string): void
  setTemplate(id: TeamTemplateId): void
  setBuilderPrompt(text: string): void
  applyBuilderDraft(coordinatorReply: string): void
  next(): void
  back(): void
}

let messageSeq = 0

const INITIAL: OnboardingState = {
  step: 1,
  displayName: '',
  vaultText: '',
  templateId: 'equipeAnimais',
  builderPrompt: '',
  roster: MOCK_TEMPLATE_ROSTER.equipeAnimais,
  builderThread: [],
}

function draftFromPrompt(prompt: string): readonly MockPersonaDraft[] {
  if (prompt.trim().length === 0) return []
  return [{ name: 'Colega novo', role: prompt.trim().slice(0, 80) }]
}

/** Snapshot store plus mutation helpers for onboarding preview. */
export function createOnboardingStore(): { store: ReturnType<typeof createSnapshotStore<OnboardingState>>; actions: OnboardingActions } {
  const store = createSnapshotStore(INITIAL)
  const actions: OnboardingActions = {
    setDisplayName: (displayName) => { store.set({ ...store.getSnapshot(), displayName }) },
    setVaultText: (vaultText) => { store.set({ ...store.getSnapshot(), vaultText }) },
    setTemplate: (templateId) => {
      store.set({ ...store.getSnapshot(), templateId, roster: MOCK_TEMPLATE_ROSTER[templateId] })
    },
    setBuilderPrompt: (builderPrompt) => { store.set({ ...store.getSnapshot(), builderPrompt }) },
    applyBuilderDraft: (coordinatorReply) => {
      const snapshot = store.getSnapshot()
      const trimmed = snapshot.builderPrompt.trim()
      if (trimmed.length === 0) return
      const draft = draftFromPrompt(trimmed)
      const userMsg: BuilderMessage = { id: `m-${++messageSeq}`, role: 'user', body: trimmed }
      const coordMsg: BuilderMessage = { id: `m-${++messageSeq}`, role: 'coordinator', body: coordinatorReply }
      store.set({
        ...snapshot,
        builderPrompt: '',
        builderThread: [...snapshot.builderThread, userMsg, coordMsg],
        roster: draft.length > 0 ? draft : snapshot.roster,
        templateId: draft.length > 0 ? 'emBranco' : snapshot.templateId,
      })
    },
    next: () => {
      const snapshot = store.getSnapshot()
      if (snapshot.step < 5) store.set({ ...snapshot, step: (snapshot.step + 1) as OnboardingState['step'] })
    },
    back: () => {
      const snapshot = store.getSnapshot()
      if (snapshot.step > 1) store.set({ ...snapshot, step: (snapshot.step - 1) as OnboardingState['step'] })
    },
  }
  return { store, actions }
}

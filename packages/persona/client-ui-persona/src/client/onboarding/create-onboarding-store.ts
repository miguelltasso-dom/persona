import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { MockPersonaDraft, TeamTemplateId } from './mock-data.ts'
import { MOCK_TEMPLATE_ROSTER } from './mock-data.ts'

export interface OnboardingState {
  readonly step: 1 | 2 | 3 | 4 | 5
  readonly displayName: string
  readonly vaultText: string
  readonly templateId: TeamTemplateId
  readonly builderPrompt: string
  readonly roster: readonly MockPersonaDraft[]
}

export interface OnboardingActions {
  setDisplayName(name: string): void
  setVaultText(text: string): void
  setTemplate(id: TeamTemplateId): void
  setBuilderPrompt(text: string): void
  applyBuilderDraft(): void
  next(): void
  back(): void
}

const INITIAL: OnboardingState = {
  step: 1,
  displayName: '',
  vaultText: '',
  templateId: 'equipeAnimais',
  builderPrompt: '',
  roster: MOCK_TEMPLATE_ROSTER.equipeAnimais,
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
    applyBuilderDraft: () => {
      const snapshot = store.getSnapshot()
      const draft = draftFromPrompt(snapshot.builderPrompt)
      if (draft.length > 0) store.set({ ...snapshot, roster: draft, templateId: 'emBranco' })
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

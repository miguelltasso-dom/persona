import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { BringProvider } from '../bring-context/bring-context-ui.ts'
import type { BringPastedChunk } from '../bring-context/BringYourContextBlock.tsx'
import { readOnboardingBycDraft } from '../bring-context/onboarding-byc-draft.ts'
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
  readonly bringPaste: string
  readonly bringProvider: BringProvider
  readonly bringPasted: readonly BringPastedChunk[]
  readonly vaultFolderPath: string | null
  readonly bringCofreSavedCount: number | null
  readonly templateId: TeamTemplateId
  readonly builderPrompt: string
  readonly roster: readonly MockPersonaDraft[]
  readonly builderThread: readonly BuilderMessage[]
}

export interface OnboardingActions {
  setDisplayName(name: string): void
  setVaultText(text: string): void
  appendVaultText(text: string): void
  setBringPaste(text: string): void
  setBringProvider(provider: BringProvider): void
  setBringPasted(chunks: readonly BringPastedChunk[]): void
  setVaultFolderPath(path: string | null): void
  setBringCofreSavedCount(count: number | null): void
  setTemplate(id: TeamTemplateId): void
  setRoster(roster: readonly MockPersonaDraft[]): void
  setBuilderPrompt(text: string): void
  applyBuilderDraft(coordinatorReply: string): void
  next(): void
  back(): void
}

let messageSeq = 0

function initialBycDraft(): Pick<OnboardingState, 'bringPaste' | 'bringProvider' | 'bringPasted' | 'vaultFolderPath'> {
  const draft = readOnboardingBycDraft()
  if (draft === null) {
    return { bringPaste: '', bringProvider: 'chatgpt', bringPasted: [], vaultFolderPath: null }
  }
  return {
    bringPaste: draft.bringPaste,
    bringProvider: draft.bringProvider,
    bringPasted: draft.pasted,
    vaultFolderPath: draft.vaultFolderPath,
  }
}

const INITIAL: OnboardingState = {
  step: 1,
  displayName: '',
  vaultText: '',
  ...initialBycDraft(),
  bringCofreSavedCount: null,
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
    appendVaultText: (chunk) => {
      const snap = store.getSnapshot()
      const merged = snap.vaultText.trim().length === 0 ? chunk.trim() : `${snap.vaultText.trim()}\n\n${chunk.trim()}`
      store.set({ ...snap, vaultText: merged })
    },
    setBringPaste: (bringPaste) => { store.set({ ...store.getSnapshot(), bringPaste }) },
    setBringProvider: (bringProvider) => { store.set({ ...store.getSnapshot(), bringProvider }) },
    setBringPasted: (bringPasted) => { store.set({ ...store.getSnapshot(), bringPasted }) },
    setVaultFolderPath: (vaultFolderPath) => { store.set({ ...store.getSnapshot(), vaultFolderPath }) },
    setBringCofreSavedCount: (bringCofreSavedCount) => { store.set({ ...store.getSnapshot(), bringCofreSavedCount }) },
    setTemplate: (templateId) => {
      store.set({ ...store.getSnapshot(), templateId, roster: MOCK_TEMPLATE_ROSTER[templateId] })
    },
    setRoster: (roster) => {
      store.set({ ...store.getSnapshot(), roster, templateId: 'emBranco' })
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

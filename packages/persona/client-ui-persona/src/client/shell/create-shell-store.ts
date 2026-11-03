import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { readOnboardingOpen, persistOnboardingComplete } from './onboarding-persistence.ts'

export type MainPanelId =
  | 'team'
  | 'search'
  | 'overview'
  | 'projects'
  | 'kanban'
  | 'knowledge'
  | 'routines'
  | 'files'
  | 'usage'
  | 'connections'
  | 'channels'
  | 'directMessages'

export interface ShellState {
  readonly activePanel: MainPanelId
  readonly hostStatus: 'unknown' | 'online' | 'offline'
  readonly hostProtocol: number | null
  /** First-run overlay (RCD: value before settings). */
  readonly onboardingOpen: boolean
}

export interface ShellActions {
  selectPanel(id: MainPanelId): void
  setHostPing(online: boolean, protocol: number | null): void
  dismissOnboarding(): void
}

const onboardingOpen = readOnboardingOpen()

const INITIAL: ShellState = {
  activePanel: onboardingOpen ? 'overview' : 'channels',
  hostStatus: 'unknown',
  hostProtocol: null,
  onboardingOpen,
}

/** Shell navigation and host connectivity snapshot. */
export function createShellStore(): {
  store: ReturnType<typeof createSnapshotStore<ShellState>>
  actions: ShellActions
} {
  const store = createSnapshotStore(INITIAL)
  const actions: ShellActions = {
    selectPanel: (activePanel) => { store.set({ ...store.getSnapshot(), activePanel }) },
    setHostPing: (online, protocol) => {
      store.set({
        ...store.getSnapshot(),
        hostStatus: online ? 'online' : 'offline',
        hostProtocol: protocol,
      })
    },
    dismissOnboarding: () => {
      persistOnboardingComplete()
      store.set({
        ...store.getSnapshot(),
        onboardingOpen: false,
        activePanel: 'channels',
      })
    },
  }
  return { store, actions }
}

export type ShellStoreHandle = ReturnType<typeof createShellStore>

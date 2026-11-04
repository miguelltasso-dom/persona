import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { overlayOpenOptimisticInitial } from '../remote/onboarding-host.ts'
import { readOnboardingCacheComplete } from './onboarding-persistence.ts'

export type MainPanelId =
  | 'team'
  | 'search'
  | 'overview'
  | 'projects'
  | 'kanban'
  | 'knowledge'
  | 'secondBrain'
  | 'routines'
  | 'files'
  | 'usage'
  | 'connections'
  | 'channels'
  | 'directMessages'
  | 'approvals'
  | 'rules'
  | 'profile'
  | 'members'
  | 'importers'
  | 'canvas'
  | 'orgChart'
  | 'teamHealth'
  | 'help'

export type HelpShellTab = 'guias' | 'novidades'

/** Profile panel targets this persona; {@link HIRE_PERSONA_PROFILE_ID} opens the new-persona editor. */
export const HIRE_PERSONA_PROFILE_ID = '__persona_new__'

export interface ShellState {
  readonly activePanel: MainPanelId
  readonly hostStatus: 'unknown' | 'online' | 'offline'
  readonly hostProtocol: number | null
  /** First-run overlay (RCD: value before settings). */
  readonly onboardingOpen: boolean
  /** When set, profile loads this host persona id (see {@link HIRE_PERSONA_PROFILE_ID}). */
  readonly profilePersonaId: string | null
  /** Profile panel shows {@link ConnectedPersonaEditor} instead of the summary hero. */
  readonly profileEditorOpen: boolean
  /** PB-5: Quadros opens this project once (consumed by ConnectedGlobalKanban). */
  readonly boardsFocusProjectId: string | null
  /** PRO-4: Visão geral → cartão no quadro global (consumed by ConnectedGlobalKanban). */
  readonly kanbanFocusTicketId: string | null
  /** PB-5: Arquivos/Rotinas/Conversa scoped to this project after leaving the quadro tab. */
  readonly projectWorkspaceProjectId: string | null
  /** Talk ACL editor overlay for a persona (rail/profile). */
  readonly talkAclPersonaId: string | null
  /** Engine picker overlay for a persona (rail/profile). */
  readonly enginePersonaId: string | null
  /** Teach-persona overlay (WAVE2). */
  readonly teachPersonaId: string | null
  /** Active teach capture session after consent (Forge RPC). */
  readonly teachCapture: {
    readonly personaId: string
    readonly sessionId: string
    readonly microphone: boolean
  } | null
  /** Ajuda: deep-link guide (e.g. #geral ? → canais); cleared when leaving the panel. */
  readonly helpDocId: string | null
  readonly helpTab: HelpShellTab | null
}

export interface ShellActions {
  selectPanel(id: MainPanelId): void
  setHostPing(online: boolean, protocol: number | null): void
  setOnboardingOpen(open: boolean): void
  dismissOnboarding(): void
  setProfilePersonaId(personaId: string | null): void
  /** Open persona editor on the profile panel (existing persona). */
  openPersonaEditor(personaId: string): void
  closePersonaEditor(): void
  /** Sidebar Projetos → quadro do projeto (PB-5). */
  openProjectBoard(projectId: string): void
  clearBoardsFocusProject(): void
  /** PRO-4: open Quadros and scroll to the ticket card when present. */
  openKanbanTicket(ticketId: string): void
  clearKanbanFocusTicket(): void
  setProjectWorkspaceProjectId(projectId: string | null): void
  openTalkAclEditor(personaId: string): void
  closeTalkAclEditor(): void
  openEngineEditor(personaId: string): void
  closeEngineEditor(): void
  openTeachPersona(personaId: string): void
  closeTeachPersona(): void
  openTeachCapture(capture: NonNullable<ShellState['teachCapture']>): void
  closeTeachCapture(): void
  /** Open Ajuda; optional guide id and tab (Novidades). */
  openHelp(options?: { readonly docId?: string; readonly tab?: HelpShellTab }): void
}

const onboardingOpen = overlayOpenOptimisticInitial(readOnboardingCacheComplete())

const INITIAL: ShellState = {
  activePanel: 'channels',
  hostStatus: 'unknown',
  hostProtocol: null,
  onboardingOpen,
  profilePersonaId: null,
  profileEditorOpen: false,
  boardsFocusProjectId: null,
  kanbanFocusTicketId: null,
  projectWorkspaceProjectId: null,
  talkAclPersonaId: null,
  enginePersonaId: null,
  teachPersonaId: null,
  teachCapture: null,
  helpDocId: null,
  helpTab: null,
}

/** Shell navigation and host connectivity snapshot. */
export function createShellStore(): {
  store: ReturnType<typeof createSnapshotStore<ShellState>>
  actions: ShellActions
} {
  const store = createSnapshotStore(INITIAL)
  const actions: ShellActions = {
    selectPanel: (activePanel) => {
      const prev = store.getSnapshot()
      store.set({
        ...prev,
        activePanel,
        ...(activePanel !== 'help' ? { helpDocId: null, helpTab: null } : {}),
      })
    },
    setHostPing: (online, protocol) => {
      store.set({
        ...store.getSnapshot(),
        hostStatus: online ? 'online' : 'offline',
        hostProtocol: protocol,
      })
    },
    setOnboardingOpen: (onboardingOpen) => {
      store.set({ ...store.getSnapshot(), onboardingOpen })
    },
    dismissOnboarding: () => {
      store.set({
        ...store.getSnapshot(),
        onboardingOpen: false,
        activePanel: 'channels',
      })
    },
    setProfilePersonaId: (profilePersonaId) => {
      store.set({ ...store.getSnapshot(), profilePersonaId })
    },
    openPersonaEditor: (personaId) => {
      store.set({
        ...store.getSnapshot(),
        activePanel: 'profile',
        profilePersonaId: personaId,
        profileEditorOpen: true,
      })
    },
    closePersonaEditor: () => {
      store.set({ ...store.getSnapshot(), profileEditorOpen: false })
    },
    openProjectBoard: (projectId) => {
      store.set({
        ...store.getSnapshot(),
        activePanel: 'kanban',
        boardsFocusProjectId: projectId,
      })
    },
    clearBoardsFocusProject: () => {
      store.set({ ...store.getSnapshot(), boardsFocusProjectId: null })
    },
    openKanbanTicket: (kanbanFocusTicketId) => {
      store.set({
        ...store.getSnapshot(),
        activePanel: 'kanban',
        kanbanFocusTicketId,
      })
    },
    clearKanbanFocusTicket: () => {
      store.set({ ...store.getSnapshot(), kanbanFocusTicketId: null })
    },
    setProjectWorkspaceProjectId: (projectWorkspaceProjectId) => {
      store.set({ ...store.getSnapshot(), projectWorkspaceProjectId })
    },
    openTalkAclEditor: (talkAclPersonaId) => {
      store.set({ ...store.getSnapshot(), talkAclPersonaId })
    },
    closeTalkAclEditor: () => {
      store.set({ ...store.getSnapshot(), talkAclPersonaId: null })
    },
    openEngineEditor: (enginePersonaId) => {
      store.set({ ...store.getSnapshot(), enginePersonaId })
    },
    closeEngineEditor: () => {
      store.set({ ...store.getSnapshot(), enginePersonaId: null })
    },
    openTeachPersona: (teachPersonaId) => {
      store.set({ ...store.getSnapshot(), teachPersonaId })
    },
    closeTeachPersona: () => {
      store.set({ ...store.getSnapshot(), teachPersonaId: null })
    },
    openTeachCapture: (teachCapture) => {
      store.set({ ...store.getSnapshot(), teachCapture, teachPersonaId: null })
    },
    closeTeachCapture: () => {
      store.set({ ...store.getSnapshot(), teachCapture: null })
    },
    openHelp: (options) => {
      store.set({
        ...store.getSnapshot(),
        activePanel: 'help',
        helpDocId: options?.docId ?? null,
        helpTab: options?.tab ?? null,
      })
    },
  }
  return { store, actions }
}

export type ShellStoreHandle = ReturnType<typeof createShellStore>

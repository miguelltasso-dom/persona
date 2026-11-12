// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub, personaLiveStoreLifecycleStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { ConnectedGlobalKanban } from '../src/client/remote/ConnectedGlobalKanban.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function liveStoreHarness(initial: PersonaLiveSnapshot): PersonaLiveStore {
  const store = createSnapshotStore(initial)
  return {
    observable: store,
    ...personaLiveStoreWave2Stub,
    ...personaLiveStoreGestorStub,
    ...personaLiveStoreLifecycleStub,
    bootstrap: async () => {},
    runDevHarnessSeedIfEnabled: async () => {},
    refresh: async () => {},
    postChannelMessage: async () => {},
    uploadChannelAttachment: async () => ({ id: 'a', name: 'f' }),
    uploadDmAttachment: async () => ({ id: 'b', name: 'f' }),
    selectDm: async () => {},
    openPersonaDm: async () => {},
    openFirstAvailableDm: async () => {},
    loadTurnContext: async () => {},
    postDmMessage: async () => {},
    toggleMessageReaction: async () => {},
    commitOnboardingRoster: async () => {},
    completeOnboarding: async () => {},
    setPersonaAutonomyLevel: async () => {},
  }
}

describe('ConnectedGlobalKanban listBoards (PB-5/10)', () => {
  it('uses host listBoards sprint label on hub tiles', async () => {
    const live = liveStoreHarness({
      ready: true,
      tenant: { workspaceId: 'ws', projectId: 'pp', memberId: 'm1', channelId: 'ch' },
      team: null,
      nowRows: [],
      stripMembers: [],
      awayEvents: [],
      attentionTitles: [],
      messages: [],
      passThroughFollowers: [],
      dms: [],
      selectedDmId: null,
      dmMessages: [],
      projects: [{ id: 'proj-contratacao', name: 'Contratação — Designer', kind: 'contratacao' }],
      kanbanCards: [],
      dmUnreadByPersonaId: {},
      suggestedTask: null,
      turnContext: null,
      error: null,
      ...PERSONA_LIVE_GESTOR_FIELDS,
    })
    const tenantObs = createLiveTenantObservable(live)
    const useLive = bindObservableForTest(live.observable)
    const useTenant = bindObservableForTest(tenantObs)
    const { store: shellStore, actions: shellActions } = createShellStore()
    const useShell = bindObservableForTest(shellStore)
    const persona = {
      listBoards: vi.fn(async () => ({
        ok: true as const,
        value: [{
          projectId: 'proj-contratacao',
          projectName: 'Contratação — Designer',
          counts: { todo: 2, doing: 0, review: 0, needs_you: 0, done: 0, blocked: 0 },
          currentSprintName: 'Sprint host 4',
          workingNow: [],
        }],
      })),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedGlobalKanban
          view="grid"
          persona={persona}
          refreshKanban={async () => {}}
          clearBoardsFocusProject={() => { shellActions.clearBoardsFocusProject() }}
          clearKanbanFocusTicket={() => { shellActions.clearKanbanFocusTicket() }}
          setProjectWorkspaceProjectId={(id) => { shellActions.setProjectWorkspaceProjectId(id) }}
          useLive={useLive}
          useTenant={useTenant}
          useShell={useShell}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Sprint host 4')).toBeTruthy()
    })
    expect(persona.listBoards).toHaveBeenCalled()
  })

  it('fresh home after the first delivery: the hub shows the REAL project with the delivered card, never the sample projects', async () => {
    const live = liveStoreHarness({
      ready: true,
      tenant: { workspaceId: 'ws', projectId: 'proj-pessoal', memberId: 'm1', channelId: 'ch' },
      team: null,
      nowRows: [],
      stripMembers: [],
      awayEvents: [],
      attentionTitles: [],
      messages: [],
      passThroughFollowers: [],
      dms: [],
      selectedDmId: null,
      dmMessages: [],
      projects: [{ id: 'proj-pessoal', name: 'Pessoal', kind: 'personal' }],
      kanbanCards: [{
        id: 'c-first', title: 'Resumo da semana', projectId: 'proj-pessoal', projectName: 'Pessoal', teamId: 't', teamName: 'T',
        column: 'done', waitingEvent: false, blocked: false, reviewApproved: true, outcome: 'completed',
      }],
      dmUnreadByPersonaId: {},
      suggestedTask: null,
      turnContext: null,
      error: null,
      ...PERSONA_LIVE_GESTOR_FIELDS,
    })
    const useLive = bindObservableForTest(live.observable)
    const useTenant = bindObservableForTest(createLiveTenantObservable(live))
    const { store: shellStore, actions: shellActions } = createShellStore()
    const useShell = bindObservableForTest(shellStore)
    // the host has no board summary rows yet: the hub must derive from what is real, not from samples
    const persona = { listBoards: vi.fn(async () => ({ ok: true as const, value: [] })) } as unknown as PersonaRemoteClient
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedGlobalKanban
          view="grid"
          persona={persona}
          refreshKanban={async () => {}}
          clearBoardsFocusProject={() => { shellActions.clearBoardsFocusProject() }}
          clearKanbanFocusTicket={() => { shellActions.clearKanbanFocusTicket() }}
          setProjectWorkspaceProjectId={(id) => { shellActions.setProjectWorkspaceProjectId(id) }}
          useLive={useLive}
          useTenant={useTenant}
          useShell={useShell}
        />
      </PreviewFrame>,
    )
    await waitFor(() => { expect(screen.getByText('Pessoal')).toBeTruthy() })
    expect(screen.getByText(/1 concluíd/u)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Contratação — Designer|Site da agência/u)
  })
})

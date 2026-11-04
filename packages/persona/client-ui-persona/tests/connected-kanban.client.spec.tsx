// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { ConnectedGlobalKanban, type ConnectedGlobalKanbanProps } from '../src/client/remote/ConnectedGlobalKanban.tsx'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
installPreviewTheme()

const LIVE_EMPTY: PersonaLiveSnapshot = {
  ready: false,
  tenant: null,
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
  projects: [],
  kanbanCards: [],
  dmUnreadByPersonaId: {},
  suggestedTask: null,
  turnContext: null,
  error: null,
  ...PERSONA_LIVE_GESTOR_FIELDS,
}

function liveStoreHarness(initial: PersonaLiveSnapshot): PersonaLiveStore {
  const store = createSnapshotStore(initial)
  return {
    observable: store,
    ...personaLiveStoreWave2Stub,
    ...personaLiveStoreGestorStub,
    bootstrap: async () => {},
    runDevHarnessSeedIfEnabled: async () => {},
    refresh: async () => {},
    postChannelMessage: async () => {},
    uploadChannelAttachment: async () => ({ id: 'att-1', name: 'file.txt' }),
    uploadDmAttachment: async () => ({ id: 'att-2', name: 'file.txt' }),
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

describe('ConnectedGlobalKanban (InjectFace)', () => {
  it('shows loading surface when live store is not ready', () => {
    const live = liveStoreHarness(LIVE_EMPTY)
    const tenantObs = createLiveTenantObservable(live)
    const useLive = bindObservableForTest(live.observable)
    const useTenant = bindObservableForTest(tenantObs)
    const { store: shellStore, actions: shellActions } = createShellStore()
    const useShell = bindObservableForTest(shellStore)

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedGlobalKanban
          persona={{} as never}
          refreshKanban={async () => {}}
          navigateProjectTab={() => {}}
          clearBoardsFocusProject={() => { shellActions.clearBoardsFocusProject() }}
          setProjectWorkspaceProjectId={(id) => { shellActions.setProjectWorkspaceProjectId(id) }}
          useLive={useLive as ConnectedGlobalKanbanProps['useLive']}
          useTenant={useTenant as ConnectedGlobalKanbanProps['useTenant']}
          useShell={useShell as ConnectedGlobalKanbanProps['useShell']}
        />
      </PreviewFrame>,
    )
    expect(document.querySelector('[data-persona-boards][aria-busy="true"]')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: kanbanPt['title.boards'] })).toBeTruthy()
  })
})

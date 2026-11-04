// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { ConnectedGlobalKanban, type ConnectedGlobalKanbanProps } from '../src/client/remote/ConnectedGlobalKanban.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'
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

function liveStoreHarness(initial: PersonaLiveSnapshot): {
  live: PersonaLiveStore
  snapStore: ReturnType<typeof createSnapshotStore<PersonaLiveSnapshot>>
} {
  const snapStore = createSnapshotStore(initial)
  const live: PersonaLiveStore = {
    observable: snapStore,
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
  return { live, snapStore }
}

describe('createLiveTenantObservable', () => {
  it('returns the same tenant snapshot reference when live snap is unchanged', () => {
    const { live } = liveStoreHarness(LIVE_EMPTY)
    const tenant = createLiveTenantObservable(live)
    const a = tenant.getSnapshot()
    const b = tenant.getSnapshot()
    expect(a).toBe(b)
    expect(a.status).toBe('loading')
  })

  it('keeps tenant ready when refresh set error but workspace scope is present (empty team)', () => {
    const { live, snapStore } = liveStoreHarness({
      ...LIVE_EMPTY,
      ready: true,
      tenant: {
        workspaceId: 'ws',
        projectId: 'pp',
        memberId: 'm1',
        channelId: 'ch',
      },
      team: { personas: [], members: [] },
      error: 'refresh-boom',
    })
    const tenant = createLiveTenantObservable(live)
    expect(tenant.getSnapshot().status).toBe('ready')
    expect(tenant.getSnapshot().scope?.workspaceId).toBe('ws')
    snapStore.set({ ...snapStore.getSnapshot(), error: 'again' })
    expect(tenant.getSnapshot().status).toBe('ready')
  })

  it('returns error tenant when bootstrap failed (no scope)', () => {
    const { live } = liveStoreHarness({
      ...LIVE_EMPTY,
      error: 'bootstrap-failed',
    })
    const tenant = createLiveTenantObservable(live)
    expect(tenant.getSnapshot().status).toBe('error')
  })

  it('returns the same tenant snapshot when live store replaces snap with equal tenant fields', () => {
    const { live, snapStore } = liveStoreHarness({
      ...LIVE_EMPTY,
      ready: true,
      tenant: {
        workspaceId: 'ws',
        projectId: 'pp',
        memberId: 'm1',
        channelId: 'ch',
      },
    })
    const tenant = createLiveTenantObservable(live)
    const first = tenant.getSnapshot()
    snapStore.set({
      ...snapStore.getSnapshot(),
      kanbanCards: [{
        id: 't1',
        title: 'Task',
        column: 'todo',
        teamId: 't',
        teamName: 'T',
        projectId: 'p',
        projectName: 'P',
        blocked: false,
        waitingEvent: false,
        reviewApproved: false,
      }],
    })
    const second = tenant.getSnapshot()
    expect(second).toBe(first)
    expect(second.status).toBe('ready')
  })
})

describe('ConnectedGlobalKanban with real observables', () => {
  it('renders ready board without maximum update depth (tenant bridge stable)', () => {
    const { live } = liveStoreHarness({
      ...LIVE_EMPTY,
      ready: true,
      tenant: {
        workspaceId: 'ws',
        projectId: 'pp',
        memberId: 'm1',
        channelId: 'ch',
      },
      kanbanCards: [{
        id: 'card-1',
        title: 'Briefing',
        column: 'todo',
        teamId: 'team',
        teamName: 'Team',
        projectId: 'proj',
        projectName: 'Proj',
        blocked: false,
        reviewApproved: false,
        waitingEvent: false,
      }],
    })
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

    expect(screen.getByRole('heading', { level: 1, name: kanbanPt['title.boards'] })).toBeTruthy()
    expect(screen.getByText('Contratação — Designer')).toBeTruthy()
  })
})

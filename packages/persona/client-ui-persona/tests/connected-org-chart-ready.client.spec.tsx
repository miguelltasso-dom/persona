// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub, personaLiveStoreLifecycleStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { ConnectedOrgChartPanel } from '../src/client/remote/ConnectedOrgChartPanel.tsx'
import { mockOrgChart } from '../src/client/governance/mock-governance.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const LIVE_WITH_TEAM: PersonaLiveSnapshot = {
  ready: true,
  tenant: {
    workspaceId: 'ws-gov',
    projectId: 'proj',
    memberId: 'owner',
    channelId: 'geral',
  },
  team: {
    personas: [{
      id: 'p-atlas',
      workspaceId: 'ws-gov',
      projectId: 'proj',
      name: 'Atlas',
      title: 'Coordenação',
      description: '',
      avatarKind: 'gallery',
      avatarRef: 'atlas',
      systemRoles: ['team_manager'],
      canRecruit: true,
    }],
    members: [{ id: 'owner', workspaceId: 'ws-gov', displayName: 'Você', handle: 'owner', role: 'owner' }],
  },
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

function harness(initial: PersonaLiveSnapshot) {
  const snapStore = createSnapshotStore(initial)
  const live: PersonaLiveStore = {
    observable: snapStore,
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
  const tenantObs = createLiveTenantObservable(live)
  const { store: shellStore } = createShellStore()
  const cardRev = createSnapshotStore({ n: 0 })
  return {
    useLive: bindObservableForTest(snapStore),
    useTenant: bindObservableForTest(tenantObs),
    useShell: bindObservableForTest(shellStore),
    usePersonaCardRevision: bindObservableForTest(cardRev),
  }
}

describe('ConnectedOrgChartPanel ready (GOV-6)', () => {
  it('loads host organogram and renders roster', async () => {
    const chart = mockOrgChart('ws-gov', 'person')
    const persona = {
      getOrgChart: async () => ({ ok: true as const, value: chart }),
    } as never
    const hooks = harness(LIVE_WITH_TEAM)

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedOrgChartPanel
          persona={persona}
          useTenant={hooks.useTenant}
          useLive={hooks.useLive}
          useShell={hooks.useShell}
          usePersonaCardRevision={hooks.usePersonaCardRevision}
          openPersonaProfile={() => {}}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Milo')).toBeTruthy()
    })
    expect(screen.getByRole('heading', { name: governancePt['org.title'] })).toBeTruthy()
  })
})

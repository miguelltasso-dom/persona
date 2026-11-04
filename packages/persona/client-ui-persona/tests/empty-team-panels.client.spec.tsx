// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { ConnectedTeamHealthPanel } from '../src/client/remote/ConnectedTeamHealthPanel.tsx'
import { ConnectedOrgChartPanel } from '../src/client/remote/ConnectedOrgChartPanel.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'

installPreviewTheme()

const LIVE_EMPTY_TEAM: PersonaLiveSnapshot = {
  ready: true,
  tenant: {
    workspaceId: 'ws-persona-local',
    projectId: 'proj-pessoal',
    memberId: 'owner',
    channelId: 'geral',
  },
  team: { personas: [], members: [{ id: 'owner', workspaceId: 'ws-persona-local', displayName: 'Você', handle: 'owner', role: 'owner' }] },
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
  return {
    live,
    useLive: bindObservableForTest(snapStore),
    useTenant: bindObservableForTest(tenantObs),
    useShell: bindObservableForTest(shellStore),
  }
}

describe('empty team product surfaces', () => {
  it('team health shows illustrated empty, not error gate', () => {
    const { useLive, useTenant, useShell } = harness(LIVE_EMPTY_TEAM)
    const persona = {} as never
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedTeamHealthPanel persona={persona} useTenant={useTenant} useLive={useLive} useShell={useShell} />
      </PreviewFrame>,
    )
    expect(screen.getByText(governancePt['health.empty.title'])).toBeTruthy()
    expect(screen.queryByText(governancePt['error.title'])).toBeNull()
  })

  it('org chart shows illustrated empty, not demo mock roster', () => {
    const { useLive, useTenant, useShell } = harness(LIVE_EMPTY_TEAM)
    const persona = {
      getOrgChart: () => Promise.resolve({ ok: true, value: { workspaceId: 'ws', groupBy: 'person', humanCount: 0, groups: [] } }),
    } as never
    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedOrgChartPanel
          persona={persona}
          useTenant={useTenant}
          useLive={useLive}
          useShell={useShell}
          usePersonaCardRevision={bindObservableForTest(createSnapshotStore({ n: 0 }))}
          openPersonaProfile={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText(governancePt['org.empty.title'])).toBeTruthy()
    expect(screen.queryByText('Milo')).toBeNull()
  })
})

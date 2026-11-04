// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub, personaLiveStoreLifecycleStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { ConnectedTeamHealthPanel } from '../src/client/remote/ConnectedTeamHealthPanel.tsx'
import { mockTeamHealth, mockTwoDayTest } from '../src/client/governance/mock-governance.ts'
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
  return {
    useLive: bindObservableForTest(snapStore),
    useTenant: bindObservableForTest(tenantObs),
    useShell: bindObservableForTest(shellStore),
  }
}

describe('ConnectedTeamHealthPanel ready (GOV-7)', () => {
  it('loads host health and shows findings', async () => {
    const health = mockTeamHealth('ws-gov')
    const persona = {
      getTeamHealth: async () => ({ ok: true as const, value: health }),
      runTwoDayTest: async () => ({ ok: true as const, value: mockTwoDayTest('ws-gov') }),
    } as never
    const { useLive, useTenant, useShell } = harness(LIVE_WITH_TEAM)

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedTeamHealthPanel persona={persona} useTenant={useTenant} useLive={useLive} useShell={useShell} />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText(health.findings[0]!.title)).toBeTruthy()
    })
    expect(screen.getByRole('heading', { name: governancePt['health.title'] })).toBeTruthy()
  })

  it('calls applyGovernanceFix when one-click fix is pressed (GOV-7 wire)', async () => {
    const health = mockTeamHealth('ws-gov')
    const applyFix = vi.fn(async () => ({ ok: true as const, value: health }))
    const persona = {
      getTeamHealth: async () => ({ ok: true as const, value: health }),
      runTwoDayTest: async () => ({ ok: true as const, value: mockTwoDayTest('ws-gov') }),
      applyGovernanceFix: applyFix,
    } as never
    const { useLive, useTenant, useShell } = harness(LIVE_WITH_TEAM)

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedTeamHealthPanel persona={persona} useTenant={useTenant} useLive={useLive} useShell={useShell} />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText(health.findings[0]!.title)).toBeTruthy()
    })
    const findings = screen.getByRole('region', { name: governancePt['health.findings'] })
    fireEvent.click(within(findings).getAllByRole('button', { name: governancePt['health.fix.set_substitute'] })[0]!)
    await waitFor(() => {
      expect(applyFix).toHaveBeenCalled()
    })
  })
})

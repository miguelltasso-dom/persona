// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createLiveTenantObservable } from '../src/client/data/live-tenant-bridge.ts'
import { pt } from '../src/client/locale/persona-editor/locales.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { ConnectedPersonaEditor } from '../src/client/remote/ConnectedPersonaEditor.tsx'
import type { PersonaLiveSnapshot, PersonaLiveStore } from '../src/client/remote/persona-live-store.ts'
import { PERSONA_LIVE_GESTOR_FIELDS, personaLiveStoreGestorStub, personaLiveStoreLifecycleStub } from './persona-live-fixtures.client.ts'
import { personaLiveStoreWave2Stub } from './persona-live-store-stub.client.ts'
import { HIRE_PERSONA_PROFILE_ID, createShellStore } from '../src/client/shell/create-shell-store.ts'

installPreviewTheme()
afterEach(() => { cleanup() })


function liveHarness(): PersonaLiveStore {
  const snap: PersonaLiveSnapshot = {
    ready: true,
    tenant: {
      workspaceId: 'ws',
      projectId: 'pp',
      memberId: 'member-1',
      channelId: 'ch',
    },
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
  const store = createSnapshotStore(snap)
  return {
    observable: store,
    ...personaLiveStoreWave2Stub,
    ...personaLiveStoreGestorStub,
    ...personaLiveStoreLifecycleStub,
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

describe('ConnectedPersonaEditor hire mode', () => {
  it('starts empty with unused animal, drafts from description, shows runner probe states', async () => {
    const live = liveHarness()
    const tenantObs = createLiveTenantObservable(live)
    const { store: shellStore, actions: shellActions } = createShellStore()
    shellActions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
    const useShell = bindObservableForTest(shellStore)
    const useTenant = bindObservableForTest(tenantObs)
    const draftPersona = vi.fn(async () => ({
      ok: true as const,
      value: {
        name: 'Tamanduá',
        title: 'Revisor',
        description: 'Revisa textos.',
        personality: 'Calmo.',
        instructions: 'Peça contexto.',
        avatarKind: 'gallery' as const,
        avatarRef: 'tamandua',
        runnerKind: 'dsh' as const,
        runnerCli: '',
        runnerModel: 'default',
        canRecruit: false,
        systemRoles: [] as const,
      },
    }))
    const createPersona = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const persona = {
      listPersonas: async () => ({
        ok: true as const,
        value: [{
          id: 'p-luna',
          workspaceId: 'ws',
          projectId: 'pp',
          name: 'Luna',
          title: 'Conteúdo',
          description: '',
          avatarKind: 'gallery',
          avatarRef: 'luna',
          systemRoles: [],
          canRecruit: false,
        }],
      }),
      listConnections: async () => ({
        ok: true as const,
        value: [{
          id: 'cursor',
          kind: 'cursor' as const,
          available: true,
          loggedIn: false,
          phase: 'checking' as const,
          loginHint: 'cursor-agent login',
          error: { code: 'not_logged_in' as const, message: '…' },
        }, {
          id: 'dsh',
          kind: 'dsh' as const,
          available: true,
          loggedIn: true,
          phase: 'ready' as const,
          loginHint: '',
        }],
      }),
      draftPersona,
      createPersona,
      getAutonomy: async () => ({ ok: true as const, value: { mode: 'propose' as const, proposalBudget: 3 } }),
    }

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedPersonaEditor
          dict={pt}
          governanceDict={governancePt}
          persona={persona as never}
          useTenant={useTenant}
          useShell={useShell}
          live={live}
        />
      </PreviewFrame>,
    )

    fireEvent.click(await screen.findByRole('button', { name: governancePt['action.skip'] }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: pt['title.new'] })).toBeTruthy()
    })

    const atlasBtn = screen.getByRole('button', { name: pt['animal.atlas'], pressed: true })
    expect(atlasBtn).toBeTruthy()

    expect(screen.queryByText(pt['runner.disconnected'])).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(pt['builder.placeholder']), { target: { value: 'Revisor de copy' } })
    fireEvent.click(screen.getByRole('button', { name: pt['builder.action'] }))
    await waitFor(() => {
      expect(draftPersona).toHaveBeenCalled()
      expect(screen.getByDisplayValue('Tamanduá')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText(pt['field.name']), { target: { value: 'Tamanduá' } })
    fireEvent.click(screen.getByRole('button', { name: pt['action.save'] }))
    await waitFor(() => {
      expect(createPersona).toHaveBeenCalled()
    })
  })

  it('GOV-8: walks StructureAssistant 4 steps and hires all personas', async () => {
    const live = liveHarness()
    const tenantObs = createLiveTenantObservable(live)
    const { store: shellStore, actions: shellActions } = createShellStore()
    shellActions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
    const useShell = bindObservableForTest(shellStore)
    const useTenant = bindObservableForTest(tenantObs)
    const createPersona = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const applyStructure = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const onHireComplete = vi.fn()

    const persona = {
      listPersonas: async () => ({ ok: true as const, value: [] }),
      listConnections: async () => ({ ok: true as const, value: [] }),
      createPersona,
      applyStructure,
      getAutonomy: async () => ({ ok: true as const, value: { mode: 'propose' as const, proposalBudget: 3 } }),
    }

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedPersonaEditor
          dict={pt}
          governanceDict={governancePt}
          persona={persona as never}
          useTenant={useTenant}
          useShell={useShell}
          live={live}
          onHireComplete={onHireComplete}
        />
      </PreviewFrame>,
    )

    // Step 1: select SaaS model
    expect(await screen.findByRole('heading', { level: 1, name: governancePt.title })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: governancePt['model.saas'] }))
    fireEvent.click(screen.getByRole('button', { name: governancePt['action.continue'] }))

    // Step 2: sectors
    expect(await screen.findByText(governancePt['step2.sectorsHint'])).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)

    // Step 3: rationale
    expect(await screen.findByText(governancePt['tip.rcd'])).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)

    // Step 4: preview and hireAll
    expect(await screen.findByText(governancePt['step4.hireHint'])).toBeTruthy()
    const hireAllBtn = screen.getByRole('button', { name: governancePt['action.hireAll'] })
    fireEvent.click(hireAllBtn)

    await waitFor(() => {
      expect(createPersona).toHaveBeenCalled()
      expect(onHireComplete).toHaveBeenCalled()
    })
    expect(createPersona.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('GOV-8: walks StructureAssistant 4 steps and hires one persona into editor', async () => {
    const live = liveHarness()
    const tenantObs = createLiveTenantObservable(live)
    const { store: shellStore, actions: shellActions } = createShellStore()
    shellActions.setProfilePersonaId(HIRE_PERSONA_PROFILE_ID)
    const useShell = bindObservableForTest(shellStore)
    const useTenant = bindObservableForTest(tenantObs)

    const persona = {
      listPersonas: async () => ({ ok: true as const, value: [] }),
      listConnections: async () => ({ ok: true as const, value: [] }),
      createPersona: vi.fn(async () => ({ ok: true as const, value: undefined })),
      getAutonomy: async () => ({ ok: true as const, value: { mode: 'propose' as const, proposalBudget: 3 } }),
    }

    render(
      <PreviewFrame brandLabel="Persona">
        <ConnectedPersonaEditor
          dict={pt}
          governanceDict={governancePt}
          persona={persona as never}
          useTenant={useTenant}
          useShell={useShell}
          live={live}
        />
      </PreviewFrame>,
    )

    // Step 1 -> 2 -> 3 -> 4
    fireEvent.click(await screen.findByRole('button', { name: governancePt['action.continue'] }))
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: governancePt['action.continue'] })[0]!)

    // Step 4: click hireOne
    const hireOneBtn = await screen.findByRole('button', { name: governancePt['action.hireOne'] })
    fireEvent.click(hireOneBtn)

    // Should transition to editor with pre-filled persona draft
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: pt['title.new'] })).toBeTruthy()
      expect(screen.getByLabelText(pt['field.name'])).toBeTruthy()
    })
  })
})

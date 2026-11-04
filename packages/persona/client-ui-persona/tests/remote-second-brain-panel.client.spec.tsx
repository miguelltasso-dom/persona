// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrainHomeView, BrainPageView } from '@deepseek-ai/dsh-persona-host/types'
import { RemoteSecondBrainPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function tenantHarness(): ReturnType<typeof bindObservableForTest<PersonaTenantSnapshot>> {
  const store = createSnapshotStore<PersonaTenantSnapshot>({
    status: 'ready',
    scope: { workspaceId: 'ws', projectId: 'proj', actorId: 'owner' },
  })
  return bindObservableForTest({
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
  })
}

function shellHarness(): ReturnType<typeof bindObservableForTest<ReturnType<ReturnType<typeof createShellStore>['store']['getSnapshot']>>> {
  const { store } = createShellStore()
  return bindObservableForTest(store)
}

function brainPage(partial: Partial<BrainPageView> & Pick<BrainPageView, 'id' | 'title'>): BrainPageView {
  return {
    kind: 'company',
    body: 'Corpo',
    slug: partial.id,
    revision: 1,
    links: [],
    sources: [],
    editorHint: 'persona:atlas',
    updatedAt: '2026-11-04T12:00:00.000Z',
    restricted: false,
    ...partial,
  }
}

const HOME: BrainHomeView = {
  startHereId: 'start',
  changedToday: [brainPage({ id: 'p1', title: 'Missão remota' })],
  activeGrants: [],
  contradictions: [],
  leftover: [],
}

describe('RemoteSecondBrainPanel (SB-5)', () => {
  it('loads getBrainHome bundle and renders changed today', async () => {
    const persona = {
      getBrainHome: vi.fn(async () => ({ ok: true as const, value: HOME })),
      listPersonas: vi.fn(async () => ({ ok: true as const, value: [{ id: 'atlas', name: 'Atlas' }] })),
      listBrainPages: vi.fn(async () => ({ ok: true as const, value: [brainPage({ id: 'start', title: 'Comece aqui' })] })),
      listBrainPermissions: vi.fn(async () => ({ ok: true as const, value: [] })),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteSecondBrainPanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Missão remota')).toBeTruthy()
    })
    expect(persona.getBrainHome).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj' })
  })
})

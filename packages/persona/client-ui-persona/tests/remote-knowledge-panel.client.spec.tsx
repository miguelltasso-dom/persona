// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteKnowledgePanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as knowledgePt } from '../src/client/locale/knowledge/locales.ts'

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

describe('RemoteKnowledgePanel (S6 Cofre)', () => {
  it('shows vault record from listVaultRecords', async () => {
    const persona = {
      listVaultRecords: vi.fn(async () => ({
        ok: true as const,
        value: [{
          id: 'company-brief',
          projectId: 'proj',
          kind: 'brief',
          body: 'Padaria artesanal no centro da cidade.',
          status: 'active',
        }],
      })),
      listVaultDocuments: vi.fn(async () => ({ ok: true as const, value: [] })),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteKnowledgePanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getAllByText(/Padaria artesanal/u).length).toBeGreaterThan(0)
    })
    expect(screen.getByRole('heading', { name: knowledgePt['title'] })).toBeTruthy()
  })
})

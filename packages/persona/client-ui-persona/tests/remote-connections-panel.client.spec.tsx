// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteConnectionsPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'

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

describe('RemoteConnectionsPanel (W2-7 wire)', () => {
  it('renders multi-seat bundle from listConnectionAccounts', async () => {
    const persona = {
      listConnectionAccounts: vi.fn(async () => ({
        ok: true as const,
        value: {
          swapPolicy: 'fixed',
          swapPolicyScope: 'workspace',
          accounts: [
            {
              id: 'c-work',
              provider: 'claude',
              label: 'Trabalho',
              available: true,
              loggedIn: true,
              phase: 'ready',
              loginHint: '',
            },
          ],
        },
      })),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteConnectionsPanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Trabalho')).toBeTruthy()
    })
    expect(screen.getByText(connectionsPt['wave2.termsNotice'])).toBeTruthy()
    expect(persona.listConnectionAccounts).toHaveBeenCalledWith({
      workspaceId: 'ws',
      projectId: 'proj',
    })
  })
})

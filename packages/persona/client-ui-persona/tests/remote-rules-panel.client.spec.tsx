// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteRulesPanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as rulesPt } from '../src/client/locale/rules/locales.ts'

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

describe('RemoteRulesPanel (PRO-5)', () => {
  it('loads triage rules from host RPC bundle', async () => {
    const persona = {
      listTriageRules: vi.fn(async () => ({
        ok: true as const,
        value: [{
          id: 'rule-1',
          gateText: 'Só admin pede deploy em produção.',
          assessmentText: 'Verificar papel antes de escalar.',
          logOnly: false,
          speculativeEnabled: false,
        }],
      })),
      listQuietWindows: vi.fn(async () => ({ ok: true as const, value: [] })),
      getProjectLimits: vi.fn(async () => ({
        ok: true as const,
        value: {
          maxProposalsPerDay: 5,
          tokensPerPersonaMonth: 100_000,
          tokensPerProjectMonth: 500_000,
        },
      })),
      listTriageLog: vi.fn(async () => ({ ok: true as const, value: [] })),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteRulesPanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Só admin pede deploy em produção.')).toBeTruthy()
    })
    expect(screen.getByRole('heading', { name: rulesPt['title'] })).toBeTruthy()
  })
})

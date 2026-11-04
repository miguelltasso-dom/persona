// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteUsagePanel } from '../src/client/data/lumen-remote-panels.tsx'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { createShellStore } from '../src/client/shell/create-shell-store.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'

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

describe('RemoteUsagePanel (OPT-7 / D5b)', () => {
  it('renders token panel from getUsagePanel', async () => {
    const getUsagePanel = vi.fn(async () => ({
      ok: true as const,
      value: {
        origin: 'measured' as const,
        tokensPerSuccessfulTask: 42,
        cacheHitRate: 0.25,
        byPersona: [{ key: 'atlas', tokens: 100, calls: 2, cacheHitRate: 0.1 }],
        byKind: [],
      },
    }))
    const persona = {
      getUsage: vi.fn(async () => ({
        ok: true as const,
        value: {
          period: { from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:59:59.999Z' },
          folds: [],
          tokens: 0,
          runs: 0,
          origin: 'measured' as const,
          originLabel: 'Medido',
        },
      })),
      getOfficialQuota: vi.fn(async () => ({
        ok: true as const,
        value: [{
          provider: 'openrouter',
          origin: 'official' as const,
          windows: [{ id: 'month', origin: 'official' as const, usedPercent: 12 }],
        }],
      })),
      listMemory: vi.fn(async () => ({ ok: true as const, value: [] })),
      listSkills: vi.fn(async () => ({ ok: true as const, value: [] })),
      listConnectionAccounts: vi.fn(async () => ({ ok: true as const, value: { accounts: [] } })),
      getUsagePanel,
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteUsagePanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: usagePt['title'] })).toBeTruthy()
    })
    expect(getUsagePanel).toHaveBeenCalled()
    expect(screen.getByText(usagePt['section.tokens'])).toBeTruthy()
    expect(screen.getByText(/42 tokens por tarefa concluída/u)).toBeTruthy()
  })
})

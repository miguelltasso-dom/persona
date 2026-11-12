// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function usagePersona(extra: Record<string, unknown> = {}): PersonaRemoteClient {
  return {
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
    ...extra,
  } as unknown as PersonaRemoteClient
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
    const persona = usagePersona({ getUsagePanel })

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteUsagePanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    // The title is also in the loading header: wait for the section the data draws, not for the heading.
    expect(await screen.findByText(usagePt['section.tokens'])).toBeTruthy()
    expect(screen.getByRole('heading', { name: usagePt['title'] })).toBeTruthy()
    expect(getUsagePanel).toHaveBeenCalled()
    expect(screen.getByText(/42 tokens por tarefa concluída/u)).toBeTruthy()
  })

  it('shows the reserve of the last 5% and spends it with “Continuar agora”', async () => {
    const getWindowReserve = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: 'reserve' as const,
        provider: 'claude',
        windowId: '5h',
        usedPercent: 96,
        resetsAt: '2026-11-11T20:00:00.000Z',
        queued: 2,
        overridden: false,
      },
    }))
    const continueWindowNow = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: 'reserve' as const,
        provider: 'claude',
        windowId: '5h',
        usedPercent: 96,
        queued: 0,
        overridden: true,
      },
    }))
    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteUsagePanel
          persona={usagePersona({ getWindowReserve, continueWindowNow })}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    expect(await screen.findByText(/A janela de 5 h está em 96%/u)).toBeTruthy()
    expect(screen.getByText(/2 conversas esperando/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: usagePt['window.continue'] }))
    expect(continueWindowNow).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj' })
    expect(await screen.findByText(usagePt['window.overridden'])).toBeTruthy()
  })

  it('writes the reserve in the singular when only one conversation waits', async () => {
    const getWindowReserve = vi.fn(async () => ({
      ok: true as const,
      value: {
        state: 'reserve' as const,
        provider: 'claude',
        windowId: '5h',
        usedPercent: 96,
        resetsAt: '2026-11-11T20:00:00.000Z',
        queued: 1,
        overridden: false,
      },
    }))
    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteUsagePanel
          persona={usagePersona({ getWindowReserve })}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )
    expect(await screen.findByText(/1 conversa esperando/u)).toBeTruthy()
    expect(screen.queryByText(/1 conversas/u)).toBeNull()
  })
})

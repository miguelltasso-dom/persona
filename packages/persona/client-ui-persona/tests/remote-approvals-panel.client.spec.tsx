// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteApprovalsPanel } from '../src/client/data/lumen-remote-panels.tsx'
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

describe('RemoteApprovalsPanel (PRO-5)', () => {
  it('shows pending hire approval from listApprovals', async () => {
    const persona = {
      listApprovals: vi.fn(async () => ({
        ok: true as const,
        value: [{
          id: 'ap-1',
          kind: 'hire',
          title: 'Pipoca',
          question: 'Contratar Pipoca como Vigia?',
          status: 'pending',
          personaId: 'coord',
          personaName: 'Atlas',
        }],
      })),
      listDailySummaries: vi.fn(async () => ({ ok: true as const, value: [] })),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteApprovalsPanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Contratar Pipoca?' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: 'Revisar e contratar' })).toBeTruthy()
  })

  it('calls decideApproval when user dismisses hire card', async () => {
    const decideApproval = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const listApprovals = vi.fn(async () => ({
      ok: true as const,
      value: [{
        id: 'ap-dismiss',
        kind: 'hire',
        title: 'Toby',
        question: 'Contratar Toby?',
        status: 'pending',
        personaId: 'coord',
        personaName: 'Atlas',
      }],
    }))
    const persona = {
      listApprovals,
      listDailySummaries: vi.fn(async () => ({ ok: true as const, value: [] })),
      decideApproval,
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteApprovalsPanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 3, name: 'Contratar Toby?' })).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
    await waitFor(() => {
      expect(decideApproval).toHaveBeenCalledWith({
        workspaceId: 'ws',
        projectId: 'proj',
        id: 'ap-dismiss',
        kind: 'hire',
        accept: false,
      })
    })
    expect(listApprovals.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('shows grouped proactive proposal from listDailySummaries (PRO-5)', async () => {
    const persona = {
      listApprovals: vi.fn(async () => ({ ok: true as const, value: [] })),
      listDailySummaries: vi.fn(async () => ({
        ok: true as const,
        value: [{
          personaId: 'atlas',
          personaName: 'Atlas',
          date: '2026-11-04',
          proposals: [{
            id: 'prop-1',
            kind: 'skill',
            title: 'Automatizar deploy',
            question: 'Posso registrar uma skill de deploy?',
            status: 'pending',
          }],
        }],
      })),
    } as unknown as PersonaRemoteClient

    render(
      <PreviewFrame brandLabel="Persona">
        <RemoteApprovalsPanel
          persona={persona}
          useTenant={tenantHarness()}
          useShell={shellHarness()}
        />
      </PreviewFrame>,
    )

    await waitFor(() => {
      expect(screen.getByText('Automatizar deploy')).toBeTruthy()
    })
    expect(screen.getByText('Atlas')).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { cleanup, render, waitFor } from '@testing-library/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteKnowledgePanel } from '../src/client/data/lumen-remote-panels.tsx'
import { REMOTE_PANEL_TIMEOUT_MS } from '../src/client/data/remote-panel-timeout.ts'
import { usePersonaRemoteLoad } from '../src/client/data/use-persona-remote-load.ts'
import type { PersonaTenantSnapshot } from '../src/client/data/persona-tenant.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { bindObservableForTest } from './bind-observable-for-test.client.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function tenantHarness(): ReturnType<typeof bindObservableForTest<PersonaTenantSnapshot>> {
  const store = createSnapshotStore<PersonaTenantSnapshot>({
    status: 'ready',
    scope: { workspaceId: 'ws-diag', projectId: 'proj-diag', actorId: 'member-1' },
  })
  return bindObservableForTest({
    getSnapshot: () => store.getSnapshot(),
    subscribe: listener => store.subscribe(listener),
  })
}

describe('usePersonaRemoteLoad request storm guard', () => {
  it('fires at most one fetch per loadKey despite unstable load callback and re-renders', async () => {
    let fetches = 0
    function StormProbe(): ReactNode {
      const [, bump] = useState(0)
      const scope = { workspaceId: 'w', projectId: 'p' }
      const load = useCallback(async () => {
        fetches += 1
        await new Promise((resolve) => { setTimeout(resolve, 50) })
        return { scope }
      }, [scope])
      usePersonaRemoteLoad(true, 'w:p', load)
      useEffect(() => {
        const id = window.setInterval(() => { bump(n => n + 1) }, 15)
        return () => { window.clearInterval(id) }
      }, [])
      return null
    }
    render(<StormProbe />)
    await waitFor(() => { expect(fetches).toBe(1) }, { timeout: 3000 })
    await new Promise((resolve) => { setTimeout(resolve, 200) })
    expect(fetches).toBe(1)
  })

  it('times out to error when loadKey is stable and load never settles', async () => {
    vi.useFakeTimers()
    let status: string = 'loading'
    function TimeoutProbe(): ReactNode {
      const load = useCallback(async () => new Promise<never>(() => {}), [])
      const { state } = usePersonaRemoteLoad(true, 'timeout-key', load)
      status = state.status
      return null
    }
    const view = render(<TimeoutProbe />)
    expect(status).toBe('loading')
    await vi.advanceTimersByTimeAsync(REMOTE_PANEL_TIMEOUT_MS + 50)
    view.rerender(<TimeoutProbe />)
    expect(status).toBe('error')
  })
})

describe('RemoteKnowledgePanel no request storm', () => {
  it('calls listVaultRecords at most once after mount and forced re-renders', async () => {
    let vaultCalls = 0
    const persona = {
      listVaultRecords: async () => {
        vaultCalls += 1
        await new Promise((resolve) => { setTimeout(resolve, 30) })
        return { ok: true as const, value: [] }
      },
    } as unknown as PersonaRemoteClient

    function Wrapper(): ReactNode {
      const [tick, setTick] = useState(0)
      useEffect(() => {
        const id = window.setInterval(() => { setTick(n => n + 1) }, 20)
        return () => { window.clearInterval(id) }
      }, [])
      return (
        <PreviewFrame brandLabel="Persona">
          <RemoteKnowledgePanel persona={persona} useTenant={tenantHarness()} />
          <span data-testid="tick">{tick}</span>
        </PreviewFrame>
      )
    }

    render(<Wrapper />)
    await waitFor(() => { expect(vaultCalls).toBeGreaterThan(0) }, { timeout: 3000 })
    await new Promise((resolve) => { setTimeout(resolve, 250) })
    expect(vaultCalls).toBeLessThanOrEqual(1)
  })
})

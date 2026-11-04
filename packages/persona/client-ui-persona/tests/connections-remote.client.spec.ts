import { describe, expect, it, vi } from 'vitest'
import { loadConnectionsAccountsUi } from '../src/client/data/connections-remote.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'

describe('loadConnectionsAccountsUi (W2-7 remote)', () => {
  it('maps host bundle to ConnectionsAccountsUi', async () => {
    const persona = {
      listConnectionAccounts: vi.fn(async () => ({
        ok: true as const,
        value: {
          swapPolicy: 'round_robin',
          swapPolicyScope: 'persona',
          accounts: [{
            id: 'c1',
            provider: 'claude',
            label: 'Trabalho',
            available: true,
            loggedIn: true,
            phase: 'ready',
            loginHint: '',
          }],
        },
      })),
    } as unknown as PersonaRemoteClient

    const ui = await loadConnectionsAccountsUi(persona, { workspaceId: 'ws', projectId: 'proj' })
    expect(ui.swapPolicy).toBe('round_robin')
    expect(ui.groups[0]?.accounts[0]?.accountLabel).toBe('Trabalho')
    expect(persona.listConnectionAccounts).toHaveBeenCalledWith({ workspaceId: 'ws', projectId: 'proj' })
  })
})

import { describe, expect, it, vi } from 'vitest'
import { loadUsagePanelRemote } from '../src/client/data/usage-panel-remote.ts'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'

describe('loadUsagePanelRemote (OPT-7)', () => {
  it('uses getUsagePanel on the persona client when present', async () => {
    const getUsagePanel = vi.fn(async () => ({
      ok: true as const,
      value: {
        origin: 'measured' as const,
        tokensPerSuccessfulTask: 10,
        cacheHitRate: 0,
        byPersona: [],
        byKind: [],
      },
    }))
    const persona = {
      getUsage: async () => ({ ok: true as const, value: { entries: [] } }),
      getOfficialQuota: async () => ({ ok: true as const, value: [] }),
      listMemory: async () => ({ ok: true as const, value: [] }),
      listSkills: async () => ({ ok: true as const, value: [] }),
      getUsagePanel,
    } as unknown as PersonaRemoteClient
    const panel = await loadUsagePanelRemote(persona, { workspaceId: 'w', projectId: 'p' })
    expect(panel?.tokensPerSuccessfulTask).toBe(10)
    expect(getUsagePanel).toHaveBeenCalledOnce()
  })

  it('returns null when host omits getUsagePanel', async () => {
    const persona = {
      getUsage: async () => ({ ok: true as const, value: { entries: [] } }),
      getOfficialQuota: async () => ({ ok: true as const, value: [] }),
      listMemory: async () => ({ ok: true as const, value: [] }),
      listSkills: async () => ({ ok: true as const, value: [] }),
    } as unknown as PersonaRemoteClient
    expect(await loadUsagePanelRemote(persona, { workspaceId: 'w' })).toBeNull()
  })
})

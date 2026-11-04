import { describe, expect, it, vi } from 'vitest'
import type { PersonaRemoteClient } from '../src/client/data/lumen-inject.ts'
import { applyStructurePlan } from '../src/client/governance/fetch-apply-structure.ts'
import { structureRecommendRpcAsk } from '../src/client/governance/structure-rpc-ask.ts'

describe('applyStructurePlan (GOV-8)', () => {
  it('structureRecommendRpcAsk splits recurring notes', () => {
    const ask = structureRecommendRpcAsk('ws-1', {
      companyModel: 'agency',
      activeSectorIds: ['ops', 'sales'],
      weeklyWorkNotes: 'triagem\nfaturamento',
    })
    expect(ask.workspaceId).toBe('ws-1')
    expect(ask.recurring).toEqual(['triagem', 'faturamento'])
    expect(ask.sectorNames.length).toBeGreaterThan(0)
  })

  it('applyStructurePlan calls host when present', async () => {
    const applyStructure = vi.fn(async () => ({ ok: true as const, value: { personas: [], explanation: '' } }))
    const client = { applyStructure } as unknown as PersonaRemoteClient
    const ok = await applyStructurePlan(client, 'ws-1', {
      companyModel: 'saas',
      activeSectorIds: ['product'],
      weeklyWorkNotes: '',
    })
    expect(ok).toBe(true)
    expect(applyStructure).toHaveBeenCalledOnce()
  })

  it('applyStructurePlan no-ops without RPC', async () => {
    const ok = await applyStructurePlan({} as PersonaRemoteClient, 'ws-1', {
      companyModel: 'office',
      activeSectorIds: [],
      weeklyWorkNotes: '',
    })
    expect(ok).toBe(false)
  })
})

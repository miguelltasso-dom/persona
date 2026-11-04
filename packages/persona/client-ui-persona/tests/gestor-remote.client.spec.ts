// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { listGestorPlansRemote } from '../src/client/data/gestor-remote.ts'

describe('listGestorPlansRemote', () => {
  it('accepts an already-unwrapped plan list from unwrapPersonaRemote', async () => {
    const plans = [{ id: 'p1', status: 'proposed' as const, summary: 'ok' }]
    const client = {
      listGestorPlans: async () => plans,
    }
    await expect(listGestorPlansRemote(client, 'ws')).resolves.toEqual(plans)
  })

  it('unwraps wire RemoteResult failures without reading undefined.code', async () => {
    const client = {
      listGestorPlans: async () => ({ ok: false as const }),
    }
    await expect(listGestorPlansRemote(client, 'ws')).rejects.toThrow('unknown')
  })

  it('returns [] when the host omits listGestorPlans', async () => {
    await expect(listGestorPlansRemote({}, 'ws')).resolves.toEqual([])
  })
})

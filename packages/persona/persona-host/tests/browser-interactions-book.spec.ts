import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it, vi, type Mock } from 'vitest'
import { ActionBridge } from '../src/action-bridge.ts'

/**
 * COLHEITA 17 (Keel, 12/11): every browser interaction the gate let through becomes one line in the activity book — the tool
 * word and the site, never what was typed.
 */
describe('the browser interactions of a turn reach the activity book', () => {
  function bridge(): { bridge: ActionBridge; seen: Mock } {
    const seen = vi.fn()
    const gate = {
      configure: () => undefined,
      arm: () => undefined,
      disarm: () => undefined,
      takeRequests: () => [],
      takeOutOfMandate: () => [],
      takeReleased: () => [],
      takeInteractions: () => [
        { tool: 'click', verb: 'click', site: 'loja.exemplo.com.br' },
        { tool: 'fill_form', verb: 'fill', site: 'loja.exemplo.com.br' },
      ],
    }
    const actions = {
      approvedDocs: () => [],
      approvedFor: () => [],
      sendingDocs: () => [],
      record: () => undefined,
      markFailed: () => undefined,
      markSending: () => undefined,
      markSent: () => undefined,
    }
    const instance = new ActionBridge({
      actions: actions as never,
      ports: () => ({ permissionRequests: () => 'blocked-report' }) as never,
      start: async () => gate as never,
      onInteractions: seen,
    })
    return { bridge: instance, seen }
  }

  it('hands the tool and the site to the host, with no value', async () => {
    const { bridge: instance, seen } = bridge()
    const gate = await instance.gateFor({ projectId: 'pp', persona: { id: 'bia' } as never, cli: 'claude', connectors: [{ id: 'c1' }] as never })
    if (gate === undefined) throw new Error('sem gate')
    const runner = {} as Runner
    instance.adopt(runner, gate)
    instance.settle(runner, { ticketId: 't1', failed: false })
    expect(seen).toHaveBeenCalledWith({ projectId: 'pp', personaId: 'bia', ticketId: 't1' }, [
      { tool: 'click', verb: 'click', site: 'loja.exemplo.com.br' },
      { tool: 'fill_form', verb: 'fill', site: 'loja.exemplo.com.br' },
    ])
  })
})

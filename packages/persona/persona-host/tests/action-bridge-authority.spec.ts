/**
 * Carbon P0-03a (colheita snapshot 1): the host's gate is armed with who the turn acts for. RED first: `ActionBridge.arm` took only `viaEmail`, so a routine's gate always ran as `person`.
 */
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { describe, expect, it, vi } from 'vitest'
import { ActionBridge } from '../src/action-bridge.ts'

function bridge(): { instance: ActionBridge; armed: ReturnType<typeof vi.fn> } {
  const armed = vi.fn()
  const gate = {
    configure: () => undefined, arm: armed, disarm: () => undefined, takeRequests: () => [], takeOutOfMandate: () => [], takeRefusals: () => [], takeReleased: () => [], takeInteractions: () => [],
  }
  const actions = { approvedDocs: () => [], approvedFor: () => [], sendingDocs: () => [], record: () => undefined, markFailed: () => undefined, markSending: () => undefined, markSent: () => undefined }
  const instance = new ActionBridge({ actions: actions as never, ports: () => ({ permissionRequests: () => 'blocked-report' }) as never, start: async () => gate as never })
  return { instance, armed }
}

async function held(instance: ActionBridge): Promise<Runner> {
  const gate = await instance.gateFor({ projectId: 'pp', persona: { id: 'bia' } as never, cli: 'claude', connectors: [{ id: 'c1', preAllow: ['read', 'send'] }] as never })
  if (gate === undefined) throw new Error('sem gate')
  const runner = {} as Runner
  instance.adopt(runner, gate)
  return runner
}

describe('ActionBridge.arm hands the gate who the turn acts for', () => {
  it('a routine and an unattended run arm the gate as such, with the e-mail mark kept beside it', async () => {
    const { instance, armed } = bridge()
    const runner = await held(instance)
    instance.arm(runner, 't1', undefined, { authority: 'routine', viaEmail: true })
    expect(armed.mock.calls[0]?.[0]).toMatchObject({ authority: 'routine', viaEmail: true })
    instance.arm(runner, 't2', undefined, { authority: 'unattended' })
    expect(armed.mock.calls[1]?.[0]).toMatchObject({ authority: 'unattended' })
  })

  it('a person (or an origin that says nothing) leaves the gate on its default', async () => {
    const { instance, armed } = bridge()
    const runner = await held(instance)
    instance.arm(runner, 't1', undefined, { authority: 'person' })
    instance.arm(runner, 't2')
    for (const call of armed.mock.calls) expect((call[0] as { authority?: string }).authority ?? 'person').toBe('person')
  })
})

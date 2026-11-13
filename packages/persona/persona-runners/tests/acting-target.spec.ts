import { describe, expect, it, vi } from 'vitest'
import {
  actingMcpTools,
  actingPortsFromComputerUse,
  createMcpGateway,
  gateComputerActing,
  openTurnTools,
  type ComputerActingContext,
  type PendingApproval,
  type PersonaToolHooks,
} from '../src/index.ts'

const run = { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }
const hooks: PersonaToolHooks = { report: () => {}, recall: () => '', ask: () => {} }
const worktree = 'C:/tmp/t-1'
const TARGET = { windowHandle: '197382', processId: 9000, title: 'Persona Fixture W3-5' } as const

describe('M9 ActingPorts ComputerActingContext (runId, target, signal)', () => {
  it('forwards host ComputerActingContext to ports, ignores forged model args, and preserves legacy arity when omitted', async () => {
    const controller = new AbortController()
    const context: ComputerActingContext = { runId: 'run-42', target: TARGET, signal: controller.signal }

    const shot = vi.fn(async (_ctx?: ComputerActingContext) => 'png')
    const click = vi.fn(async (_x: number, _y: number, _ctx?: ComputerActingContext) => 'clicked')
    const type = vi.fn(async (_text: string, _ctx?: ComputerActingContext) => 'typed')

    const scopedTools = Object.fromEntries(actingMcpTools(run, {
      computerScreenshot: shot,
      computerClick: click,
      computerType: type,
    }, 'write', context).map(tool => [tool.name, tool]))

    await scopedTools.persona_computer_screenshot?.handler({ target: { windowHandle: '999', processId: 1 } })
    await scopedTools.persona_computer_click?.handler({ x: 12, y: 34, runId: 'forged', target: { windowHandle: '1', processId: 1 } })
    await scopedTools.persona_computer_type?.handler({ text: 'oi', target: { windowHandle: '1', processId: 1 } })

    expect(shot).toHaveBeenCalledWith(context)
    expect(click).toHaveBeenCalledWith(12, 34, context)
    expect(type).toHaveBeenCalledWith('oi', context)

    shot.mockClear()
    click.mockClear()
    type.mockClear()

    const legacyTools = Object.fromEntries(actingMcpTools(run, {
      computerScreenshot: shot,
      computerClick: click,
      computerType: type,
    }, 'write').map(tool => [tool.name, tool]))

    await legacyTools.persona_computer_screenshot?.handler({})
    await legacyTools.persona_computer_click?.handler({ x: 5, y: 6 })
    await legacyTools.persona_computer_type?.handler({ text: 'ok' })

    expect(shot.mock.calls[0]).toEqual([])
    expect(click.mock.calls[0]).toEqual([5, 6])
    expect(type.mock.calls[0]).toEqual(['ok'])
  })

  it('gateComputerActing and actingPortsFromComputerUse forward context and refuse immediately when signal is aborted', async () => {
    const controller = new AbortController()
    const context: ComputerActingContext = { runId: 'run-7', target: TARGET, signal: controller.signal }
    const seen: Array<{ fn: string; ctx: ComputerActingContext | undefined }> = []

    const ports = gateComputerActing(actingPortsFromComputerUse({
      held: () => false,
      screenshot: async (ctx) => { seen.push({ fn: 'shot', ctx }); return 'png' },
      click: async (x, y, ctx) => { seen.push({ fn: 'click', ctx }); return `${x},${y}` },
      type: async (text, ctx) => { seen.push({ fn: 'type', ctx }); return text },
    }), () => false)

    expect(await ports.computerScreenshot?.(context)).toBe('png')
    expect(await ports.computerClick?.(1, 2, context)).toBe('1,2')
    expect(await ports.computerType?.('abc', context)).toBe('abc')
    expect(seen.map(item => [item.fn, item.ctx])).toEqual([
      ['shot', context],
      ['click', context],
      ['type', context],
    ])

    controller.abort()
    expect(await ports.computerScreenshot?.(context)).toBe('parado a pedido')
    expect(await ports.computerClick?.(3, 4, context)).toBe('parado a pedido')
    expect(await ports.computerType?.('def', context)).toBe('parado a pedido')
    expect(seen).toHaveLength(3)
  })

  it('McpGateway + openTurnTools enforce authority first, forward context on person approve, and fail closed after Stop', async () => {
    const controller = new AbortController()
    const computer: ComputerActingContext = { runId: 'run-99', target: TARGET, signal: controller.signal }
    const seen: Array<ComputerActingContext | undefined> = []
    const approvals: PendingApproval[] = []

    const gateway = createMcpGateway({
      hooks,
      acting: {
        computerScreenshot: async (ctx) => { seen.push(ctx); return 'png' },
        computerClick: async (x, y, ctx) => { seen.push(ctx); return `ok ${x},${y}` },
        computerType: async (text, ctx) => { seen.push(ctx); return `typed ${text}` },
      },
      onApproval: (approval) => { approvals.push(approval) },
    })

    // Unattended authority MUST still be denied with no card and no port calls even when computer context is present.
    const unattended = openTurnTools(gateway, { run, toolLevel: 'write', worktree, authority: 'unattended', computer })!
    const denied = await unattended.tools.find(t => t.name === 'persona_computer_click')!.handler({ x: 1, y: 2 })
    expect(denied.isError).toBe(true)
    expect(denied.content).toMatch(/pessoa por trás/u)
    expect(approvals).toHaveLength(0)
    expect(seen).toHaveLength(0)
    await unattended.close?.()

    // Person turn receives computer context after approval.
    const lease = gateway.openTurn({ run, toolLevel: 'write', worktree, authority: 'person', computer })
    const ask1 = await gateway.call(lease.token, 'persona_computer_click', { x: 10, y: 20 })
    expect(ask1.approvalId).toBeDefined()
    expect(seen).toHaveLength(0)
    const done1 = await gateway.approve(ask1.approvalId!)
    expect(done1.content).toBe('ok 10,20')
    expect(seen).toEqual([computer])

    // Aborting stops a pending approval BEFORE executing it, and stops new calls BEFORE creating cards.
    const ask2 = await gateway.call(lease.token, 'persona_computer_type', { text: 'ola' })
    expect(ask2.approvalId).toBeDefined()
    const cardsBeforeStop = approvals.length
    controller.abort()

    const stoppedApprove = await gateway.approve(ask2.approvalId!)
    expect(stoppedApprove.refused).toBe(true)
    expect(seen).toHaveLength(1)

    const stoppedCall = await gateway.call(lease.token, 'persona_computer_screenshot', {})
    expect(stoppedCall.refused).toBe(true)
    expect(approvals).toHaveLength(cardsBeforeStop)
    expect(seen).toHaveLength(1)
  })
})

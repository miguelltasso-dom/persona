import { describe, expect, it } from 'vitest'
import { actingMcpTools, actingPortsFromComputerUse, gateComputerActing } from '../src/index.ts'

const run = { personaId: 'nina', ticketId: 't1', assignmentId: 'a1' }

describe('gateComputerActing', () => {
  it('refuses click and type while the human holds control; screenshot stays', async () => {
    let held = true
    const clicks: Array<[number, number]> = []
    const ports = gateComputerActing({
      computerScreenshot: async () => 'png',
      computerClick: async (x, y) => {
        clicks.push([x, y])
        return 'clicked'
      },
      computerType: async () => 'typed',
    }, () => held)
    const tools = Object.fromEntries(actingMcpTools(run, ports, 'write').map(tool => [tool.name, tool]))
    expect((await tools.persona_computer_screenshot?.handler({}))?.content).toBe('png')
    expect((await tools.persona_computer_click?.handler({ x: 10, y: 20 }))?.content).toBe('humano no controle')
    expect((await tools.persona_computer_type?.handler({ text: 'oi' }))?.content).toBe('humano no controle')
    expect(clicks).toEqual([])
    held = false
    expect((await tools.persona_computer_click?.handler({ x: 10, y: 20 }))?.content).toBe('clicked')
    expect(clicks).toEqual([[10, 20]])
  })

  it('binds a desktop computer-use host onto MCP ports', async () => {
    let held = true
    const ports = actingPortsFromComputerUse({
      held: () => held,
      screenshot: async () => 'png',
      click: async (x, y) => `click ${x},${y}`,
      type: async text => `type ${text}`,
    })
    const tools = Object.fromEntries(actingMcpTools(run, ports, 'write').map(tool => [tool.name, tool]))
    expect((await tools.persona_computer_click?.handler({ x: 1, y: 2 }))?.content).toBe('humano no controle')
    held = false
    expect((await tools.persona_computer_click?.handler({ x: 1, y: 2 }))?.content).toBe('click 1,2')
    expect((await tools.persona_computer_type?.handler({ text: 'ok' }))?.content).toBe('type ok')
  })
})

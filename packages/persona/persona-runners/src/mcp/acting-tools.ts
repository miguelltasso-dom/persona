/**
 * Browser / computer tools as Persona MCP tools (none | read | write).
 * External actions go through the gateway approval gate.
 */

import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'
import type { PersonaMcpTool, PersonaRunIdentity } from './persona-tools.ts'

export interface ActingPorts {
  browserOpen?: (url: string) => Promise<string>
  browserRead?: (url: string) => Promise<string>
  browserAct?: (action: string) => Promise<string>
  computerScreenshot?: () => Promise<string>
  computerClick?: (x: number, y: number) => Promise<string>
  computerType?: (text: string) => Promise<string>
}

export const ACTING_TOOLS = [
  'persona_browser_open',
  'persona_browser_read',
  'persona_browser_act',
  'persona_computer_screenshot',
  'persona_computer_click',
  'persona_computer_type',
] as const

function missing(name: string): string {
  return `${name} unavailable`
}

/**
 * Persona-facing browser and computer tools bound to one run.
 * @param run - Assignment identity (gateway owns the token; handlers ignore it).
 * @param ports - Injected Harness adapters; missing ports report unavailable.
 * @param toolLevel - Persona grant.
 */
export function actingMcpTools(
  run: PersonaRunIdentity,
  ports: ActingPorts,
  toolLevel: ToolLevel,
): PersonaMcpTool[] {
  void run
  const tools: PersonaMcpTool[] = [
    {
      name: 'persona_browser_open',
      description: 'Open a page in the hosted browser (read).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const url = typeof args.url === 'string' ? args.url : ''
        return { content: ports.browserOpen === undefined ? missing('persona_browser_open') : await ports.browserOpen(url) }
      },
    },
    {
      name: 'persona_browser_read',
      description: 'Read the current page text.',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const url = typeof args.url === 'string' ? args.url : ''
        return { content: ports.browserRead === undefined ? missing('persona_browser_read') : await ports.browserRead(url) }
      },
    },
    {
      name: 'persona_browser_act',
      description: 'Click or type in the hosted browser (external; needs approval).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const action = typeof args.action === 'string' ? args.action : ''
        return { content: ports.browserAct === undefined ? missing('persona_browser_act') : await ports.browserAct(action) }
      },
    },
    {
      name: 'persona_computer_screenshot',
      description: 'Capture the local screen (read).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async () => ({
        content: ports.computerScreenshot === undefined
          ? missing('persona_computer_screenshot')
          : await ports.computerScreenshot(),
      }),
    },
    {
      name: 'persona_computer_click',
      description: 'Click on the local screen (external; needs approval).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const x = typeof args.x === 'number' ? args.x : 0
        const y = typeof args.y === 'number' ? args.y : 0
        return {
          content: ports.computerClick === undefined
            ? missing('persona_computer_click')
            : await ports.computerClick(x, y),
        }
      },
    },
    {
      name: 'persona_computer_type',
      description: 'Type into the focused local window (external; needs approval).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const text = typeof args.text === 'string' ? args.text : ''
        return {
          content: ports.computerType === undefined
            ? missing('persona_computer_type')
            : await ports.computerType(text),
        }
      },
    },
  ]
  return tools.filter(tool => allowsTool(toolLevel, tool.name))
}

/**
 * Refuse local click/type while the human holds the overlay.
 * Screenshot stays allowed (read).
 * @param ports - Injected adapters.
 * @param held - True when any persona is in `human` state.
 */
export function gateComputerActing(ports: ActingPorts, held: () => boolean): ActingPorts {
  return {
    ...ports,
    computerClick: async (x, y) => {
      if (held()) return 'humano no controle'
      return ports.computerClick === undefined ? missing('persona_computer_click') : ports.computerClick(x, y)
    },
    computerType: async (text) => {
      if (held()) return 'humano no controle'
      return ports.computerType === undefined ? missing('persona_computer_type') : ports.computerType(text)
    },
  }
}

/**
 * Bind desktop computer-use (UIA / hook) onto MCP acting ports.
 * @param host - Overlay hold + injected click/type/screenshot.
 * @returns Ports for {@link actingMcpTools}.
 */
export function actingPortsFromComputerUse(host: {
  readonly held: () => boolean
  readonly screenshot?: () => Promise<string>
  readonly click?: (x: number, y: number) => Promise<string>
  readonly type?: (text: string) => Promise<string>
}): ActingPorts {
  return gateComputerActing({
    ...(host.screenshot === undefined ? {} : { computerScreenshot: host.screenshot }),
    ...(host.click === undefined ? {} : { computerClick: host.click }),
    ...(host.type === undefined ? {} : { computerType: host.type }),
  }, host.held)
}

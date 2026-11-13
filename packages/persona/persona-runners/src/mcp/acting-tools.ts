/**
 * Browser / computer tools as Persona MCP tools (none | read | write).
 * External actions go through the gateway approval gate.
 */

import type { ComputerUseTarget } from '@deepseek-ai/dsh-persona-engine'
import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'
import type { PersonaMcpTool, PersonaRunIdentity } from './persona-tools.ts'

/** Host-bound computer run identity, target window scope, and cancellation signal forwarded to acting ports. */
export interface ComputerActingContext {
  readonly runId?: string
  readonly target?: ComputerUseTarget
  readonly signal?: AbortSignal
}

export interface ActingPorts {
  browserOpen?: (url: string) => Promise<string>
  browserRead?: (url: string) => Promise<string>
  browserAct?: (action: string) => Promise<string>
  computerScreenshot?: (context?: ComputerActingContext) => Promise<string>
  computerClick?: (x: number, y: number, context?: ComputerActingContext) => Promise<string>
  computerType?: (text: string, context?: ComputerActingContext) => Promise<string>
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
 * @param computer - Optional host-bound computer run context (never read from model tool arguments).
 * @returns Filtered MCP tool definitions permitted by `toolLevel`.
 */
export function actingMcpTools(
  run: PersonaRunIdentity,
  ports: ActingPorts,
  toolLevel: ToolLevel,
  computer?: ComputerActingContext,
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
      handler: async () => {
        if (computer?.signal?.aborted === true) return { content: 'parado a pedido' }
        if (ports.computerScreenshot === undefined) return { content: missing('persona_computer_screenshot') }
        return {
          content: computer === undefined ? await ports.computerScreenshot() : await ports.computerScreenshot(computer),
        }
      },
    },
    {
      name: 'persona_computer_click',
      description: 'Click on the local screen (external; needs approval).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        if (computer?.signal?.aborted === true) return { content: 'parado a pedido' }
        const x = typeof args.x === 'number' ? args.x : 0
        const y = typeof args.y === 'number' ? args.y : 0
        if (ports.computerClick === undefined) return { content: missing('persona_computer_click') }
        return {
          content: computer === undefined ? await ports.computerClick(x, y) : await ports.computerClick(x, y, computer),
        }
      },
    },
    {
      name: 'persona_computer_type',
      description: 'Type into the focused local window (external; needs approval).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        if (computer?.signal?.aborted === true) return { content: 'parado a pedido' }
        const text = typeof args.text === 'string' ? args.text : ''
        if (ports.computerType === undefined) return { content: missing('persona_computer_type') }
        return {
          content: computer === undefined ? await ports.computerType(text) : await ports.computerType(text, computer),
        }
      },
    },
  ]
  return tools.filter(tool => allowsTool(toolLevel, tool.name))
}

/**
 * Refuse local click/type while the human holds the overlay, and refuse all computer actions after abort.
 * Screenshot stays allowed (read) when not aborted.
 * @param ports - Injected adapters.
 * @param held - True when any persona is in `human` state.
 * @returns Gated acting ports forwarding optional context.
 */
export function gateComputerActing(ports: ActingPorts, held: () => boolean): ActingPorts {
  const shot = ports.computerScreenshot
  return {
    ...ports,
    ...(shot === undefined ? {} : {
      computerScreenshot: async (context?: ComputerActingContext) => {
        if (context?.signal?.aborted === true) return 'parado a pedido'
        return context === undefined ? shot() : shot(context)
      },
    }),
    computerClick: async (x: number, y: number, context?: ComputerActingContext) => {
      if (context?.signal?.aborted === true) return 'parado a pedido'
      if (held()) return 'humano no controle'
      if (ports.computerClick === undefined) return missing('persona_computer_click')
      return context === undefined ? ports.computerClick(x, y) : ports.computerClick(x, y, context)
    },
    computerType: async (text: string, context?: ComputerActingContext) => {
      if (context?.signal?.aborted === true) return 'parado a pedido'
      if (held()) return 'humano no controle'
      if (ports.computerType === undefined) return missing('persona_computer_type')
      return context === undefined ? ports.computerType(text) : ports.computerType(text, context)
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
  readonly screenshot?: (context?: ComputerActingContext) => Promise<string>
  readonly click?: (x: number, y: number, context?: ComputerActingContext) => Promise<string>
  readonly type?: (text: string, context?: ComputerActingContext) => Promise<string>
}): ActingPorts {
  return gateComputerActing({
    ...(host.screenshot === undefined ? {} : { computerScreenshot: host.screenshot }),
    ...(host.click === undefined ? {} : { computerClick: host.click }),
    ...(host.type === undefined ? {} : { computerType: host.type }),
  }, host.held)
}

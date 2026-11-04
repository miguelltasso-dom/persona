/**
 * Outbound Telegram / email tools. Sending leaves the machine; the gateway
 * parks the call on Precisa de você and then replays the approved arguments.
 */

import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'
import type { PersonaMcpTool } from '../mcp/persona-tools.ts'

export interface OutboundPorts {
  telegramSend?: (input: { chat: string; text: string }) => Promise<string>
  emailSend?: (input: { to: string; subject: string; text: string }) => Promise<string>
}

/**
 * Tools that send a message off-box. Listed only at write.
 * @param ports - Injected adapters (fake in tests).
 * @param toolLevel - Persona grant.
 */
export function outboundMcpTools(ports: OutboundPorts, toolLevel: ToolLevel): PersonaMcpTool[] {
  const tools: PersonaMcpTool[] = [
    {
      name: 'persona_telegram_send',
      description: 'Reply on the origin Telegram chat (external; needs approval).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const chat = typeof args.chat === 'string' ? args.chat : ''
        const text = typeof args.text === 'string' ? args.text : ''
        if (ports.telegramSend === undefined) return { content: 'persona_telegram_send unavailable' }
        return { content: await ports.telegramSend({ chat, text }) }
      },
    },
    {
      name: 'persona_email_send',
      description: 'Reply on the origin email thread (external; needs approval).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const to = typeof args.to === 'string' ? args.to : ''
        const subject = typeof args.subject === 'string' ? args.subject : ''
        const text = typeof args.text === 'string' ? args.text : ''
        if (ports.emailSend === undefined) return { content: 'persona_email_send unavailable' }
        return { content: await ports.emailSend({ to, subject, text }) }
      },
    },
  ]
  return tools.filter(tool => allowsTool(toolLevel, tool.name))
}

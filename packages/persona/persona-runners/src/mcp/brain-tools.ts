/**
 * Segundo cérebro MCP tools (SB-4). Domain/ACL live in persona-core; ports bind the store.
 * Tools never see another turn's token. Identity is the run persona.
 */

import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'
import type { PersonaMcpTool, PersonaRunIdentity } from './persona-tools.ts'

/** Tool ids advertised on a turn lease. */
export const BRAIN_TOOLS = ['brain_search', 'brain_read', 'brain_propose'] as const

/** Host/store adapters; ACL is enforced inside the port. */
export interface BrainPorts {
  search?: (input: {
    personaId: string
    text: string
    kind?: string
    linkedFrom?: string
  }) => Promise<string>
  read?: (input: { personaId: string; pageId: string }) => Promise<string>
  propose?: (input: {
    personaId: string
    pageId: string
    title?: string
    body?: string
  }) => Promise<string>
}

function missing(name: string): string {
  return `${name} unavailable`
}

/**
 * brain_search / brain_read / brain_propose bound to one run.
 * @param run - Assignment identity (personaId wins over args).
 * @param ports - Host/store adapters.
 * @param toolLevel - Persona grant.
 */
export function brainMcpTools(
  run: PersonaRunIdentity,
  ports: BrainPorts,
  toolLevel: ToolLevel,
): PersonaMcpTool[] {
  const tools: PersonaMcpTool[] = [
    {
      name: 'brain_search',
      description: 'Search Segundo cérebro pages (ACL per page; no title if denied).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const text = typeof args.text === 'string' ? args.text : typeof args.query === 'string' ? args.query : ''
        const kind = typeof args.kind === 'string' ? args.kind : undefined
        const linkedFrom = typeof args.linkedFrom === 'string' ? args.linkedFrom : undefined
        if (ports.search === undefined) return { content: missing('brain_search') }
        return {
          content: await ports.search({
            personaId: run.personaId,
            text,
            ...(kind === undefined ? {} : { kind }),
            ...(linkedFrom === undefined ? {} : { linkedFrom }),
          }),
        }
      },
    },
    {
      name: 'brain_read',
      description: 'Read a brain page and recall linked neighbors (ACL each hop).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const pageId = typeof args.pageId === 'string' ? args.pageId : typeof args.id === 'string' ? args.id : ''
        if (ports.read === undefined) return { content: missing('brain_read') }
        return { content: await ports.read({ personaId: run.personaId, pageId }) }
      },
    },
    {
      name: 'brain_propose',
      description: 'Propose a brain page edit. Required rules need human accept.',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        const pageId = typeof args.pageId === 'string' ? args.pageId : typeof args.id === 'string' ? args.id : ''
        const title = typeof args.title === 'string' ? args.title : undefined
        const body = typeof args.body === 'string' ? args.body : undefined
        if (ports.propose === undefined) return { content: missing('brain_propose') }
        return {
          content: await ports.propose({
            personaId: run.personaId,
            pageId,
            ...(title === undefined ? {} : { title }),
            ...(body === undefined ? {} : { body }),
          }),
        }
      },
    },
  ]
  return tools.filter(tool => allowsTool(toolLevel, tool.name))
}

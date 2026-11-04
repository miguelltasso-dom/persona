/**
 * Gestor de equipe MCP tools (GES-2). Domain/ACL live in persona-core.
 * Tools never grant more access than the holder; identity is the run persona.
 */

import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'
import type { PersonaMcpTool, PersonaRunIdentity } from './persona-tools.ts'

/** Tool ids advertised on a write lease. */
export const GESTOR_TOOLS = [
  'gestor_hire',
  'gestor_allocate',
  'gestor_reorganize',
  'gestor_assemble',
] as const

/** Host/engine adapters; plan → approve → apply stays inside the port. */
export interface GestorPorts {
  hire?: (input: { personaId: string; summary: string }) => Promise<string>
  allocate?: (input: { personaId: string; summary: string }) => Promise<string>
  reorganize?: (input: { personaId: string; summary: string }) => Promise<string>
  assemble?: (input: { personaId: string; summary: string }) => Promise<string>
}

function missing(name: string): string {
  return `${name} unavailable`
}

function summaryOf(args: Record<string, unknown>): string {
  return typeof args.summary === 'string' ? args.summary : typeof args.goal === 'string' ? args.goal : ''
}

/**
 * Hire / allocate / reorganize / assemble bound to one run.
 * @param run - Assignment identity (personaId wins over args).
 * @param ports - Host/engine adapters.
 * @param toolLevel - Persona grant.
 */
export function gestorMcpTools(
  run: PersonaRunIdentity,
  ports: GestorPorts,
  toolLevel: ToolLevel,
): PersonaMcpTool[] {
  const tools: PersonaMcpTool[] = [
    {
      name: 'gestor_hire',
      description: 'Propose hiring a persona (plan → approve → apply; never exceeds Gestor access).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        if (ports.hire === undefined) return { content: missing('gestor_hire') }
        return { content: await ports.hire({ personaId: run.personaId, summary: summaryOf(args) }) }
      },
    },
    {
      name: 'gestor_allocate',
      description: 'Propose allocating a persona to a project or sector.',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        if (ports.allocate === undefined) return { content: missing('gestor_allocate') }
        return { content: await ports.allocate({ personaId: run.personaId, summary: summaryOf(args) }) }
      },
    },
    {
      name: 'gestor_reorganize',
      description: 'Propose a team reorg within the Gestor scope.',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        if (ports.reorganize === undefined) return { content: missing('gestor_reorganize') }
        return { content: await ports.reorganize({ personaId: run.personaId, summary: summaryOf(args) }) }
      },
    },
    {
      name: 'gestor_assemble',
      description: 'Propose assembling a team for a goal (structure + workflow + sprint).',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: async (args) => {
        if (ports.assemble === undefined) return { content: missing('gestor_assemble') }
        return { content: await ports.assemble({ personaId: run.personaId, summary: summaryOf(args) }) }
      },
    },
  ]
  return tools.filter(tool => allowsTool(toolLevel, tool.name))
}

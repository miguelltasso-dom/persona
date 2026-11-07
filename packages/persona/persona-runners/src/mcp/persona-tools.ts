/**
 * Persona tools served to CLI runners via OAR `serveMcpTools`.
 * Identity is captured from the run that opened the server, never from arguments.
 */

import { allowsTool, type ToolLevel } from '../resolve/tool-level.ts'

const PERSONA_TOOL = 'persona_'

export interface PersonaRunIdentity {
  personaId: string
  ticketId: string
  assignmentId: string
}

export interface PersonaToolCall {
  name: string
  run: PersonaRunIdentity
  args: Record<string, unknown>
}

export interface PersonaToolHooks {
  report(input: { run: PersonaRunIdentity; state: string; summary: string; facts?: unknown }): void
  recall(input: { run: PersonaRunIdentity; query: string }): string
  /**
   * The persona asks the person. `question` is the plain form; `questions` carries the structured form (chips, a sequence) exactly
   * as the model wrote it (the Host validates); `assumption` is the persona going on without an answer. Whatever string the hook
   * returns is handed back to the model (a refusal with the way forward); returning nothing answers `asked`.
   */
  ask(input: { run: PersonaRunIdentity; question: string; questions?: unknown; assumption?: string }): void | string
}

export interface PersonaMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<{ content: string }>
}

export interface ServeMcpToolsFn {
  (input: { name: string; tools: PersonaMcpTool[]; instructions: string }): Promise<{
    mcpServers: unknown
    close: () => Promise<void>
  }>
}

/**
 * Build Persona MCP tools bound to one run. A forged `personaId` / `ticketId`
 * in the arguments is ignored; the run identity wins.
 * @param run - assignment that opened the CLI session.
 * @param hooks - engine callbacks (report updates the ticket).
 * @param toolLevel - Persona grant; tools above it are not advertised.
 */
export function personaMcpTools(
  run: PersonaRunIdentity,
  hooks: PersonaToolHooks,
  toolLevel: ToolLevel = 'write',
): PersonaMcpTool[] {
  const bind = (name: string, description: string, handle: (args: Record<string, unknown>) => string,
    inputSchema: Record<string, unknown> = { type: 'object', additionalProperties: true }): PersonaMcpTool => ({
    name,
    description,
    inputSchema,
    handler: async (args: Record<string, unknown>) => {
      if (typeof args.personaId === 'string' && args.personaId !== run.personaId) {
        return { content: 'forged actor refused' }
      }
      if (typeof args.ticketId === 'string' && args.ticketId !== run.ticketId) {
        return { content: 'forged actor refused' }
      }
      return { content: handle(args) }
    },
  })
  return [
    bind(`${PERSONA_TOOL}report`, 'Report assignment progress to the ticket.', (args) => {
      const summary = typeof args.summary === 'string' ? args.summary : ''
      const state = typeof args.state === 'string' ? args.state : 'progress'
      hooks.report({ run, state, summary, ...(Object.hasOwn(args, 'facts') ? { facts: args.facts } : {}) })
      return 'reported'
    }, {
      type: 'object', additionalProperties: true,
      properties: {
        state: { type: 'string' }, summary: { type: 'string' },
        facts: { type: 'array', items: { type: 'object', additionalProperties: false,
          properties: {
            kind: { type: 'string', enum: ['decision', 'preference', 'rule', 'person', 'process', 'reference'] },
            title: { type: 'string' }, body: { type: 'string' }, evidence: { type: 'string' },
          }, required: ['kind', 'title', 'body', 'evidence'] } },
      },
    }),
    bind(`${PERSONA_TOOL}recall`, 'Recall authorized memory for this run.', (args) => {
      const query = typeof args.query === 'string' ? args.query : ''
      return hooks.recall({ run, query })
    }),
    bind(`${PERSONA_TOOL}ask`, 'Ask the person a question: 2-8 short options if it is a choice, up to 5 questions. If it is not worth interrupting, go on and state your assumption.', (args) => {
      const question = typeof args.question === 'string' ? args.question : ''
      const assumption = typeof args.assumption === 'string' ? args.assumption : undefined
      // The structured form: a `questions` list, or a `question` with `options`/`multiple`. The Host reads and validates it.
      const structured = Object.hasOwn(args, 'questions')
        ? args.questions
        : (Object.hasOwn(args, 'options') || args.multiple === true ? { question, options: args.options, multiple: args.multiple } : undefined)
      const answered = hooks.ask({
        run, question,
        ...(structured === undefined ? {} : { questions: structured }),
        ...(assumption === undefined ? {} : { assumption }),
      })
      return typeof answered === 'string' && answered !== '' ? answered : 'asked'
    }, {
      type: 'object', additionalProperties: true,
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
        multiple: { type: 'boolean' },
        questions: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false,
          properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 }, multiple: { type: 'boolean' } },
          required: ['question'] } },
        assumption: { type: 'string' },
      },
    }),
  ].filter(tool => allowsTool(toolLevel, tool.name))
}

/**
 * Serve the bound tools through OAR `serveMcpTools`.
 * @param serve - OAR helper (or a test double).
 * @param run - run identity baked into every tool.
 * @param hooks - engine callbacks.
 * @param toolLevel - Persona grant forwarded to {@link personaMcpTools}.
 */
export async function servePersonaMcpTools(
  serve: ServeMcpToolsFn,
  run: PersonaRunIdentity,
  hooks: PersonaToolHooks,
  toolLevel: ToolLevel = 'write',
): Promise<{ mcpServers: unknown; close: () => Promise<void>; tools: PersonaMcpTool[] }> {
  const tools = personaMcpTools(run, hooks, toolLevel)
  const served = await serve({
    name: 'persona',
    tools,
    instructions: `Persona tools for persona ${run.personaId} on ticket ${run.ticketId}.`,
  })
  return { ...served, tools }
}

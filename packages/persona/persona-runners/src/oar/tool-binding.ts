/**
 * HT-0: serve the product tools of a turn to a live CLI session (OAR `serveMcpTools`).
 *
 * A CLI session outlives a turn (warm pool), but a tool call must run as the turn that is live NOW: the served handlers never close
 * over one turn, they delegate to `binding.current` (the tool set the host offered for the turn in flight). Between turns
 * `current` is empty and any call is refused, so a late or replayed call can never act as a previous ticket. The identity is therefore
 * the turn (the host's gateway lease behind the handler), never an argument and never the session.
 */

import type { McpServer } from '@botiverse/oar'
import { createHash } from 'node:crypto'
import type { TurnToolSet } from '../contract.ts'

export const DEFAULT_TOOL_SERVER = 'persona'

/** `serveMcpTools` as OAR exports it (or a test double). */
export interface ServeHostTools {
  (options: {
    name: string
    tools: readonly {
      name: string
      description?: string
      inputSchema: Readonly<Record<string, unknown>>
      handler: (input: Readonly<Record<string, unknown>>, context: { signal: AbortSignal }) => unknown
    }[]
    instructions?: string
  }): Promise<{ server: McpServer; close(): Promise<void> }>
}

export class ToolsUnavailableError extends Error {
  readonly code = 'tools_unavailable'
  constructor(detail: string) {
    super(`As ferramentas da Persona não puderam ser oferecidas à CLI: ${detail}`)
    this.name = 'ToolsUnavailableError'
  }
}

export interface ToolBinding {
  /** Server name the CLI knows the tools by (`mcp__<name>__<tool>` in Claude). */
  readonly name: string
  /** Names + schemas + server: a different set must not reuse this session (the CLI listed its tools at start). */
  readonly signature: string
  /** `SessionOptions.mcpServers` entry. */
  readonly server: McpServer
  /** The set of the turn in flight; empty between turns. */
  current: TurnToolSet | undefined
  close(): Promise<void>
}

/**
 * Stable identity of the tool LIST (not of the turn): server name, tool names and their schemas.
 * @param set - Tools a turn offers.
 */
export function toolSignature(set: TurnToolSet | undefined): string {
  if (set === undefined || set.tools.length === 0) return ''
  const rows = [...set.tools]
    .map(tool => `${tool.name}\u0000${JSON.stringify(tool.inputSchema)}`)
    .sort()
  return createHash('sha1').update(`${set.server ?? DEFAULT_TOOL_SERVER}\u0001${rows.join('\u0002')}`).digest('hex').slice(0, 16)
}

/**
 * Name the CLI shows for the server; invalid names fall back to the default (the strictest runtime rule is `^[\w-]+$`).
 * @param set - Tools a turn offers.
 */
export function serverNameOf(set: TurnToolSet): string {
  const name = set.server ?? DEFAULT_TOOL_SERVER
  return /^[\w-]{1,32}$/u.test(name) ? name : DEFAULT_TOOL_SERVER
}

function asResult(outcome: { content: string; isError?: boolean }): { content: { type: 'text'; text: string }[]; isError?: boolean } {
  return { content: [{ type: 'text', text: outcome.content }], ...(outcome.isError === true ? { isError: true } : {}) }
}

/**
 * Serve `set` and return the binding. The served handlers resolve the CURRENT turn on every call.
 * @param set - Tools of the first turn that needs this session (later turns must have the same signature).
 * @param serve - OAR `serveMcpTools` (injected in tests).
 */
export async function bindTools(set: TurnToolSet, serve: ServeHostTools): Promise<ToolBinding> {
  const name = serverNameOf(set)
  const binding = { current: undefined as TurnToolSet | undefined }
  const tools = set.tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    handler: async (args: Readonly<Record<string, unknown>>) => {
      const turn = binding.current
      const live = turn?.tools.find(row => row.name === tool.name)
      if (turn === undefined || live === undefined) {
        return asResult({ content: 'Ferramenta fora do turno em andamento: recusada.', isError: true })
      }
      try {
        return asResult(await live.handler({ ...args }))
      } catch (error) {
        return asResult({ content: error instanceof Error ? error.message : String(error), isError: true })
      }
    },
  }))
  let served: Awaited<ReturnType<ServeHostTools>>
  try {
    served = await serve({
      name,
      tools,
      ...(set.instructions === undefined ? {} : { instructions: set.instructions }),
    })
  } catch (error) {
    throw new ToolsUnavailableError(error instanceof Error ? error.message : String(error))
  }
  const handle = {
    name,
    signature: toolSignature(set),
    server: served.server,
    get current() { return binding.current },
    set current(next: TurnToolSet | undefined) { binding.current = next },
    close: () => served.close(),
  }
  return handle
}

/**
 * Claude in `dontAsk` mode refuses what no rule allows, and the product tools are not "built in": allow exactly the server
 * the host served (the gateway behind each handler is the ACL), nothing else. `=` keeps the variadic flag from eating the next arg.
 * @param name - Server name.
 */
export function claudeAllowToolsArgs(name: string): string[] {
  return [`--allowedTools=mcp__${name}`]
}

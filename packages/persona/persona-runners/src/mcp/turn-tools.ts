/**
 * HT-0: the bridge between the per-turn MCP gateway and a live CLI turn.
 *
 * The host opens ONE lease per delivered turn (identity = that assignment, persona grant = its tool level) and gets back a
 * `TurnToolSet`: every definition the gateway announces for this turn, each call routed through `gateway.call` with the lease
 * token, so the ACL, the per-call approval and the forged-identity refusal of X-1 apply to what the CLI does exactly as they do in
 * the tests. The runner never sees the token; it only serves these tools and calls `close` when the turn is over.
 */

import type { AuthorityKind } from '../authority/authority-table.ts'
import type { TurnToolSet } from '../contract.ts'
import type { ToolLevel } from '../resolve/tool-level.ts'
import type { ComputerActingContext } from './acting-tools.ts'
import type { McpCallResult, McpGateway } from './gateway.ts'
import type { PersonaRunIdentity } from './persona-tools.ts'

export interface OpenTurnToolsInput {
  run: PersonaRunIdentity
  /** The persona's grant: tools above it are not even announced. */
  toolLevel: ToolLevel
  /** The assignment worktree (a write outside it pauses for the person). */
  worktree: string
  /** D-117: who the turn acts for; the computer tools are refused unless a person is behind it. */
  authority?: AuthorityKind
  /** D-117: host-bound computer run context (`runId`, `target`, `signal`) forwarded to computer ports. */
  computer?: ComputerActingContext
  /** Server name the CLI shows (`mcp__<server>__<tool>` in Claude). Default `persona`. */
  server?: string
  instructions?: string
}

function sentenceOf(result: McpCallResult): string {
  const parts = [result.content]
  if (result.question !== undefined && !result.content.includes(result.question)) parts.push(result.question)
  if (result.approvalId !== undefined) parts.push('A ação espera a decisão da pessoa; não tente de novo nem contorne.')
  return parts.join(' ')
}

/**
 * Open the gateway lease of one turn and return the tools the CLI may call during it.
 * @param gateway - the process gateway (real ports behind its tools).
 * @param input - run identity, grant and worktree of this turn.
 * @returns the set to put in `StartTurnInput.mcpTools`; `undefined` when the grant leaves no tool to offer.
 */
export function openTurnTools(gateway: McpGateway, input: OpenTurnToolsInput): TurnToolSet | undefined {
  const lease = gateway.openTurn({
    run: input.run,
    toolLevel: input.toolLevel,
    worktree: input.worktree,
    ...(input.authority === undefined ? {} : { authority: input.authority }),
    ...(input.computer === undefined ? {} : { computer: input.computer }),
  })
  const definitions = gateway.describe(lease.token)
  if (definitions.length === 0) {
    gateway.closeTurn(lease.token)
    return undefined
  }
  return {
    server: input.server ?? 'persona',
    ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
    tools: definitions.map(definition => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      handler: async (args: Record<string, unknown>) => {
        const result = await gateway.call(lease.token, definition.name, args)
        return result.refused === true
          ? { content: sentenceOf(result), isError: true }
          : { content: sentenceOf(result) }
      },
    })),
    close: () => { gateway.closeTurn(lease.token) },
  }
}

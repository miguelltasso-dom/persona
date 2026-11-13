/**
 * D-117 / L3 origin classification and per-turn tool selection for computer use.
 */

import { isEventRunId } from './routine-events.ts'
import type { RunOrigin } from './computer-runs.ts'

/** Triggers emitted by third-party webhooks/mail/chat: nobody is actively commanding the desktop. */
const EXTERNAL_TRIGGER = /^(?:mail|gh|github|telegram|slack|discord|whatsapp|webhook):/u

/** The three computer-acting MCP tools (absent from the turn list whenever there is no human ComputerRun). */
export const COMPUTER_MCP_TOOL_NAMES: ReadonlySet<string> = new Set([
  'persona_computer_screenshot',
  'persona_computer_click',
  'persona_computer_type',
])

const ORIGIN_RANK: Readonly<Record<RunOrigin, number>> = {
  person: 0,
  routine: 1,
  initiative: 2,
  quadro: 3,
  handoff: 4,
}

const pickStricter = (current: RunOrigin, candidate: RunOrigin): RunOrigin =>
  (ORIGIN_RANK[candidate] > ORIGIN_RANK[current] ? candidate : current)

function originOfTriggerId(id: string): RunOrigin {
  if (id.startsWith('handoff:')) return 'handoff'
  if (id.startsWith('board:')) return 'quadro'
  if (id.startsWith('routine-run:')) return isEventRunId(id) ? 'initiative' : 'routine'
  if (id.startsWith('initiative:') || id.startsWith('plan:') || id.startsWith('campaign:') || EXTERNAL_TRIGGER.test(id)) return 'initiative'
  return 'person'
}

/**
 * Derive D-117 `RunOrigin` for a Task without consulting prompt text.
 * Only direct human messages stay `'person'`; board pulls, routines, initiatives, third-party events, and colleague handoffs stay non-person (`L3`).
 * @param ticket - Ticket trigger metadata (`origin.triggerId`, `origin.triggerIds`, absorbed `inputs`).
 * @param lookup - Optional autonomous board lookup (`lead_pull`).
 * @returns Effective {@link RunOrigin} taking the strictest provenance seen across trigger ids and inputs.
 */
export function originForComputerRun(
  ticket: {
    readonly id: string
    readonly origin: { readonly triggerId: string; readonly triggerIds: readonly string[] }
    readonly inputs: readonly { readonly kind: string; readonly triggerId?: string }[]
  },
  lookup: { readonly boardDriven?: (ticketId: string) => boolean },
): RunOrigin {
  let result: RunOrigin = lookup.boardDriven?.(ticket.id) === true ? 'quadro' : 'person'
  const triggerIds = [
    ticket.origin.triggerId,
    ...ticket.origin.triggerIds,
    ...ticket.inputs.flatMap(item => (item.kind === 'trigger' && item.triggerId !== undefined ? [item.triggerId] : [])),
  ]
  for (const rawId of triggerIds) {
    result = pickStricter(result, originOfTriggerId(rawId))
    const splitInner = /^split:(.+):[^:]+$/u.exec(rawId)?.[1]
    if (splitInner !== undefined) result = pickStricter(result, originOfTriggerId(splitInner))
  }
  return result
}

/**
 * Decide which tools from a gateway lease reach one turn: keeps non-computer tools confined to `needed` + `coordination` when `toolLevel === 'none'`,
 * and offers `persona_computer_*` ONLY when `computerAuthorized` is true.
 * @param tools - Tools emitted by `openTurnTools`.
 * @param needed - Product tool names needed by the turn.
 * @param grantless - Whether the persona has no file/shell grant (`toolLevel === 'none'`).
 * @param coordination - Tools allowed without a file/shell grant.
 * @param computerAuthorized - True only for a human-backed turn with a live non-aborted `ComputerActingContext`.
 * @returns Filtered list of tools exposed to the CLI turn.
 */
export function selectTurnTools<T extends { readonly name: string }>(
  tools: readonly T[],
  needed: readonly string[],
  grantless: boolean,
  coordination: ReadonlySet<string>,
  computerAuthorized: boolean,
): T[] {
  return tools.filter((tool) => {
    if (COMPUTER_MCP_TOOL_NAMES.has(tool.name)) return computerAuthorized
    return needed.includes(tool.name) && (!grantless || coordination.has(tool.name))
  })
}

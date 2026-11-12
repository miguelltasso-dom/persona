/**
 * Carbon RED-3 (Gauge): "a regra da casa vale em todo turno". The records of kind constraint/decision are REQUIRED context (persona-core: they enter every compilation).
 * The conversation prompt already carries them (`composeHostTalk`, the `required` slice); a Task's prompt did not, so the promise and the "Contexto usado" audit lied.
 * This file is what the Task prompt appends, and the one sentence the owner reads when the rules are bigger than what fits in a turn (never silent, never dropped).
 */

import { foldHostTalkUsed, type HostTalkUsedRow } from '@deepseek-ai/dsh-persona-engine'

/**
 * @param used - The compiled "Contexto usado" of the turn.
 * @returns The house rules as a block for a Task's prompt ("" when there are none): all of them, in a stable order (the rules never depend on the request).
 */
export function requiredRulesBlock(used: readonly HostTalkUsedRow[]): string {
  const { required } = foldHostTalkUsed(used)
  if (required === '') return ''
  return `Regras da casa (valem em todo turno; siga todas, sem exceção):\n${required.split('\n').map(line => `- ${line}`).join('\n')}`
}

/** What the owner reads when the house rules are bigger than what fits in a turn: plain words (no tokens, no budget), and the promise kept. */
export const RULES_TOO_BIG_LINE = 'As regras da casa passaram do limite que cabe em cada conversa. Eu sigo todas mesmo assim, mas o trabalho fica mais lento e mais caro: vale resumir algumas.'

/** @param error - What the context compiler threw. @returns Whether the required records are bigger than the budget. */
export function isRulesTooBig(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'REQUIRED_CONTEXT_OVERFLOW'
}

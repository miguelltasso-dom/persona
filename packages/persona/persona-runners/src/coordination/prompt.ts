/**
 * Coordination-function system prompt from Forge P6 (`composePrompt`).
 * Identity is the persona that holds the function (D-043).
 */

import { composePrompt, ROUTER_FORBIDDEN_TOOLS } from '@deepseek-ai/dsh-persona-engine'

/** Session id for the project's coordination function (one long session). */
export const COORDINATION_SESSION_ID = 'coordination'

export interface CoordinationPersona {
  id: string
  name: string
  instructions?: string
}

/**
 * Full coordination prompt. Placeholders are filled from the persona that
 * currently holds the coordination function (D-043).
 * @param persona - identity of the persona assigned coordination.
 */
export function coordinationPrompt(persona: CoordinationPersona): string {
  const extra = persona.instructions === undefined || persona.instructions.length === 0
    ? ''
    : `\n\nPersona instructions:\n${persona.instructions}`
  const policy = [
    `Forbidden tools: ${ROUTER_FORBIDDEN_TOOLS.join(', ')}. Never request a shell.`,
    'Events that arrive while you are inferring wait for the next turn (non-blocking; D-041).',
    extra,
  ].join('\n')
  return [
    composePrompt({
      part: 'coordinator',
      identity: { name: persona.name, title: 'Coordenação' },
      policy,
    }),
    composePrompt({
      part: 'dispatch',
      identity: { name: persona.name, title: 'Coordenação' },
      policy,
    }),
    composePrompt({
      part: 'replies',
      identity: { name: persona.name, title: 'Coordenação' },
      policy,
    }),
    composePrompt({
      part: 'subscriptions',
      identity: { name: persona.name, title: 'Coordenação' },
      policy,
    }),
  ].join('\n')
}

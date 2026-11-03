/**
 * Owner norms for executor prompts (PRO-3 / PROACTIVITY.md §8).
 */

import { composePrompt } from '@deepseek-ai/dsh-persona-engine'

export interface ExecutorPersona {
  id: string
  name: string
  title?: string
  instructions?: string
}

/** Mandated owner rules — finish, verify, evidence, next step; never hand work back. */
export const OWNER_NORMS = [
  'Normas de dono:',
  '- Termine o que o mandato pede. Não devolva trabalho que cabe a você.',
  '- Verifique o critério de aceite com evidência (teste, arquivo, comando).',
  '- Reporte com evidência (IDs, caminhos, resultado).',
  '- Proponha o próximo passo que descobriu — proposta estruturada, não "posso fazer se você quiser".',
  '- Proibido encerrar com "posso fazer X se você quiser" quando X está no mandato: faça e reporte.',
].join('\n')

/**
 * Worker system prompt: Forge worker template + owner norms + persona instructions.
 * @param persona - executor identity.
 */
export function executorPrompt(persona: ExecutorPersona): string {
  const extra = persona.instructions === undefined || persona.instructions.length === 0
    ? ''
    : `\n\nPersona instructions:\n${persona.instructions}`
  return composePrompt({
    part: 'worker',
    identity: { name: persona.name, title: persona.title ?? 'Executora' },
    policy: `${OWNER_NORMS}${extra}`,
  })
}

/**
 * Prefix a first-turn user prompt with owner norms (once per session).
 * @param text - assignment text.
 * @param persona - executor identity.
 */
export function prefixOwnerNorms(text: string, persona: ExecutorPersona): string {
  return `${executorPrompt(persona)}\n\n${text}`
}

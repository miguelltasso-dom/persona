/**
 * Owner norms for executor prompts (PRO-3 / PROACTIVITY.md §8).
 */

import { composePrompt, isShortAnswerTask, OWNER_NORMS, WORKER_LEAN_REPORT_RULE, WORKER_PROMPT_MARK } from '@deepseek-ai/dsh-persona-engine'

export interface ExecutorPersona {
  id: string
  name: string
  title?: string
  instructions?: string
}

/** Mandated owner rules — finish, verify, evidence, next step; never hand work back. One wording, defined by the engine's prompt templates. */
export { OWNER_NORMS }

/**
 * Worker system prompt: Forge worker template + owner norms + persona instructions.
 * @param persona - executor identity.
 * @param options - `leanReport` (OPT-6 / W3, default false): ask for a short "Resultado:" / "Bloqueio:" final report.
 */
export function executorPrompt(persona: ExecutorPersona, options: { leanReport?: boolean; tools?: 'none' } = {}): string {
  const extra = persona.instructions === undefined || persona.instructions.length === 0
    ? ''
    : `\n\nPersona instructions:\n${persona.instructions}`
  return composePrompt({
    part: 'worker',
    identity: { name: persona.name, title: persona.title ?? 'Executora' },
    policy: `${OWNER_NORMS}${extra}`,
    ...(options.leanReport === true ? { leanReport: true } : {}),
    ...(options.tools === 'none' ? { tools: 'none' as const } : {}),
  })
}

/**
 * Prefix a first-turn user prompt with owner norms (once per session). IDEMPOTENT (OPT-10): a prompt that already IS a worker prompt (the answer-only
 * route's `firstDeliveryExecutionPrompt` composes the worker template itself) is not wrapped in a second one; measured on the first delivery, the second
 * copy was 910 characters, the whole template and the norms twice. The lean-report rule, if asked for, still rides in.
 * @param text - assignment text.
 * @param persona - executor identity.
 * @param options - Same as {@link executorPrompt}.
 */
export function prefixOwnerNorms(text: string, persona: ExecutorPersona, options: { leanReport?: boolean; tools?: 'none'; leanShortAnswers?: boolean } = {}): string {
  // W3 for short answers only: the lean report rides in when the host asked for it for every task (`leanReport`), or only for a task that is a short answer
  // (`leanShortAnswers` + the conservative classifier). A handoff, a review, a first delivery or a deliverable never gets it from the second switch.
  const lean = options.leanReport === true || (options.leanShortAnswers === true && isShortAnswerTask(text))
  if (text.includes(WORKER_PROMPT_MARK)) {
    return lean && !text.includes(WORKER_LEAN_REPORT_RULE) ? `${WORKER_LEAN_REPORT_RULE}\n\n${text}` : text
  }
  return `${executorPrompt(persona, { ...(lean ? { leanReport: true } : {}), ...(options.tools === 'none' ? { tools: 'none' as const } : {}) })}\n\n${text}`
}

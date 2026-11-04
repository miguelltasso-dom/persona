/**
 * Talk to a persona that is already working (T3-UX-HARVEST §4 + §11):
 * queue the message for after the turn, or steer the current turn.
 * `/lado` is an aside that never joins the thread.
 */

import { DomainError } from './schemas.ts'

export type WorkingSendMode = 'queue' | 'steer'

export interface QueuedUserMessage {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly text: string
  readonly createdAt: string
}

export interface AsideAsk {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly question: string
  readonly onThread: false
}

/**
 * Idle send is immediate. While working, the preferred mode applies;
 * `alternate` (Ctrl+Enter) flips it.
 * @param working - Persona has an open turn.
 * @param prefer - Default button action.
 * @param alternate - Modifier key.
 */
export function resolveWorkingSend(
  working: boolean,
  prefer: WorkingSendMode,
  alternate: boolean,
): WorkingSendMode {
  if (!working) return 'steer'
  if (!alternate) return prefer
  return prefer === 'queue' ? 'steer' : 'queue'
}

/**
 * @param input - Identity and text.
 */
export function enqueueWorkingMessage(input: {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly text: string
  readonly createdAt: string
}): QueuedUserMessage {
  const text = input.text.trim()
  if (input.id === '' || input.personaId === '' || input.subjectId === '' || text === '') {
    throw new DomainError('INVALID_PERSONA', 'QUEUE')
  }
  return { ...input, text }
}

/**
 * @param queue - Current dashed bubbles.
 * @param id - Row to edit.
 * @param text - New body.
 */
export function editQueuedMessage(
  queue: readonly QueuedUserMessage[],
  id: string,
  text: string,
): QueuedUserMessage[] {
  const next = text.trim()
  if (next === '') throw new DomainError('INVALID_PERSONA', 'QUEUE')
  return queue.map(row => row.id === id ? { ...row, text: next } : row)
}

/**
 * @param queue - Current dashed bubbles.
 * @param id - Row to drop.
 */
export function dropQueuedMessage(
  queue: readonly QueuedUserMessage[],
  id: string,
): QueuedUserMessage[] {
  return queue.filter(row => row.id !== id)
}

/**
 * @param question - `/lado` text.
 */
export function openAsideAsk(input: {
  readonly id: string
  readonly personaId: string
  readonly subjectId: string
  readonly question: string
}): AsideAsk {
  const question = input.question.trim()
  if (input.id === '' || question === '') throw new DomainError('INVALID_PERSONA', 'ASIDE')
  return {
    id: input.id,
    personaId: input.personaId,
    subjectId: input.subjectId,
    question,
    onThread: false,
  }
}

/**
 * Aside never becomes a conversation message.
 * @param ask - `/lado` row.
 */
export function asideStaysOffThread(ask: AsideAsk): boolean {
  return ask.onThread === false
}

export interface CitedComposer {
  readonly quote: string
  readonly comment: string
  readonly prompt: string
}

/**
 * Quote and optional comment stay in separate data blocks (T3 §5).
 * @param quote - Selected reply text.
 * @param comment - Optional human note.
 */
export function composeCitedMessage(quote: string, comment: string = ''): CitedComposer {
  const cited = quote.trim()
  if (cited === '') throw new DomainError('INVALID_PERSONA', 'CITE')
  const note = comment.trim()
  const quoteBlock = `<dado origem="citacao">\n${cited}\n</dado>`
  const prompt = note === ''
    ? quoteBlock
    : `${quoteBlock}\n\n<dado origem="comentario">\n${note}\n</dado>`
  return { quote: cited, comment: note, prompt }
}

export interface LimitPause {
  readonly reason: string
  readonly until: string
  readonly queue: readonly QueuedUserMessage[]
}

/**
 * Motor stopped on a quota. The dashed queue stays (T3 §12).
 * @param reason - Honest explanation.
 * @param until - ISO or human window end.
 * @param queue - Messages already queued.
 */
export function pauseAtLimit(
  reason: string,
  until: string,
  queue: readonly QueuedUserMessage[],
): LimitPause {
  if (reason.trim() === '' || until.trim() === '') throw new DomainError('INVALID_PERSONA', 'LIMIT')
  return { reason: reason.trim(), until: until.trim(), queue: [...queue] }
}

/**
 * Resume does not drop the queue.
 * @param pause - Stored limit banner.
 */
export function resumeAfterLimit(pause: LimitPause): {
  readonly keepQueue: true
  readonly queue: readonly QueuedUserMessage[]
} {
  return { keepQueue: true, queue: pause.queue }
}

export const COMPOSER_SLASH_COMMANDS = [
  { id: 'limites', slash: '/limites' },
  { id: 'assunto', slash: '/assunto' },
  { id: 'lado', slash: '/lado' },
  { id: 'ensinar', slash: '/ensinar' },
  { id: 'contratar', slash: '/contratar' },
  { id: 'resumo', slash: '/resumo' },
] as const

/**
 * @param text - Composer line.
 * @returns Matching command id, or undefined.
 */
export function matchComposerSlash(text: string): (typeof COMPOSER_SLASH_COMMANDS)[number]['id'] | undefined {
  const first = text.trim().split(/\s+/)[0] ?? ''
  return COMPOSER_SLASH_COMMANDS.find(row => row.slash === first)?.id
}

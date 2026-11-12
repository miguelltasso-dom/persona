/**
 * Colheita item 3, in the CONVERSATION (#geral, a DM): how a talk turn ends is decided by the same rules as a Task's (`turn-close.ts`), on her RAW words,
 * before the speech layer and before anything is settled in the thread. This file is only what differs from a Task:
 *
 *   - a conversation has no tools and no draft, so the facts are `hadTools: false` and `savedFiles: 0` (the note she gets then asks for the content in the text);
 *   - a conversation has no Task to "Continuar": when the extra turns did not make it true, ONE honest sentence stands in for her words and nothing else is offered
 *     (the owner just talks again); the Task path keeps the one-click card (`continue-card.ts`);
 *   - a secret asked in the chat never reaches the thread: the sentence that points to the Cofre goes instead.
 *
 * The loop that hands the note back and runs the turn again is `runTurnClose` (turn-close-host.ts); the wiring is `Orchestration.closeTalkTurn`.
 */

import { sentencesOf } from './turn-close.ts'
import type { TurnCloseOutcome } from './turn-close-host.ts'

/**
 * Carbon P1-01: a tool call the gate REFUSED did nothing, so it is no proof of work. One occurrence per refused call is taken out (a tool called twice, refused once, still counts once).
 * @param tools - The tool names the turn called, in order.
 * @param refused - The tool names the gate refused in that turn.
 */
export function withoutRefused(tools: readonly string[], refused: readonly string[]): readonly string[] {
  if (refused.length === 0) return tools
  const pending = [...refused]
  return tools.filter((tool) => {
    const at = pending.indexOf(tool)
    if (at < 0) return true
    pending.splice(at, 1)
    return false
  })
}

/**
 * The question a turn ended on (Carbon P1-01: `perguntou = espera` in a Task): the last sentence with a "?" of what the owner READS (the technical fold is not part of it),
 * or the last sentence when the request had no mark. At most 240 characters.
 * @param words - Her words.
 */
export function questionOfWords(words: string): string {
  const visible = words.replace(/<details[\s\S]*?<\/details>/giu, ' ')
  const sentences = sentencesOf(visible)
  const asked = sentences.filter(sentence => /[?？؟]/u.test(sentence))
  return (asked.at(-1) ?? sentences.at(-1) ?? visible).trim().slice(0, 240)
}

/** What the thread shows for a conversation turn once the rules have ruled. */
export interface TalkClosed {
  /** Her words (or the honest sentence that replaced them), still RAW: the speech layer runs next. */
  readonly words: string
  /** The rules held her words back and a sentence of the host stands in (it is posted as the host's own line, not as hers). */
  readonly replaced: boolean
}

/**
 * @param outcome - What {@link runTurnClose} decided (and her last raw words).
 * @returns What goes to the speech layer: her words as they are, or the honest sentence when they must not be posted.
 */
export function talkClosedWords(outcome: TurnCloseOutcome): TalkClosed {
  const verdict = outcome.verdict
  if (verdict?.kind === 'cartao-continuar') return { words: verdict.fala, replaced: true }
  if (verdict?.kind === 'esperar-dono' && verdict.motivo === 'segredo' && verdict.fala !== undefined) return { words: verdict.fala, replaced: true }
  return { words: outcome.words, replaced: false }
}

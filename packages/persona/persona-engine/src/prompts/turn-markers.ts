/**
 * Item 11 (cartão de escolha) e item 19a (indicadores): the two lines that teach a persona to write the markers `[[escolha: …]]` and `[[indicador: …]]`
 * (Rivet's constants: `core/choices.ts`, `core/indicators.ts`). WHERE they go is one rule (Tally, 12/11, Keel's budget rule):
 *  - ONLY in a conversation turn the PERSON started: never in an initiative, a routine, a team note or a Task (nobody reads a card there, and each of those prompts is
 *    paid by the day: the first try, with the lines in the `talk` template, cost +18.6% on `initiative-30-busy`);
 *  - in the STABLE PREFIX (the host puts them at the end of the `capabilities` paragraph), as constants: no word of the person's message, no clock, no id decides them,
 *    so a warm session keeps its cache (at the cached rate the two lines cost about a tenth of their size per turn after the first).
 * One source for the host (`talkLayers`) and for the token bench, so what the gate measures is what the host sends.
 */
import { CHOICE_PROMPT_LINE } from '../core/choices.ts'
import { INDICATOR_PROMPT_LINE } from '../core/indicators.ts'

/**
 * @param personStarted - The conversation turn was started by a person (the host's `isPersonAuthor`); false for an initiative, a routine, a team note.
 * @returns The text to append to the `capabilities` paragraph (with its leading space), or `''` when the turn does not teach the markers.
 */
export function markerLinesFor(personStarted: boolean): string {
  return personStarted ? ` ${CHOICE_PROMPT_LINE} ${INDICATOR_PROMPT_LINE}` : ''
}

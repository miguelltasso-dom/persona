/**
 * The end-of-turn choice card (colheita item 11, Muse's `fimDoTurno` variant of the persona question card).
 *
 * A persona that ends her turn offering 2 to 6 paths writes ONE marker line in her message (`[[escolha: pergunta | a | b]]`, see the engine's
 * `readChoiceMarker`). Nothing is stored for the card itself: the host reads the marker when it builds the message for the screen (the words
 * without the marker, plus the card), so every runner, every kind of turn and every message path gets the card the same way, and the card
 * can be read again and again without a write. What is stored is only the ANSWER: one record per card, written when the person taps.
 *
 * The tap is her own, short message in the same conversation (`✓ B · Post para o Instagram`), addressed to the persona who offered, and it
 * goes through the same door as any message the person writes, so it opens a new turn. Nobody waits for the card: the Task is not blocked.
 */

import { choiceAnswerText, readChoiceMarker, type ChoiceCard } from '@deepseek-ai/dsh-persona-engine'
import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { PersonaAskCardView, PersonaAskView } from './types.ts'

const KIND = 'persona_choice'

/** The `askId` of the card of a message (stable: the same message is always the same card). */
export function choiceAskId(messageId: string): string {
  return `choice:${messageId}`
}

/** What the screen gets for a persona's message that carries a marker: the words without it, and the card when it is valid. */
export interface ChoiceMessage {
  readonly body: string
  readonly personaAsk?: PersonaAskCardView
}

/**
 * @param input - The persona's stored message and who she is.
 * @returns The message as the screen shows it, or undefined when the message offers nothing (no marker).
 */
export function choiceMessageOf(input: { readonly messageId: string; readonly body: string; readonly personaId: string; readonly personaName: string }): ChoiceMessage | undefined {
  const read = readChoiceMarker(input.body)
  if (read.text === input.body) return undefined
  if (read.card === undefined) return { body: read.text }
  return {
    body: read.text,
    personaAsk: {
      kind: 'fimDoTurno',
      askId: choiceAskId(input.messageId),
      ticketId: '',
      personaId: input.personaId,
      personaName: input.personaName,
      question: read.card.question,
      options: read.card.options.map(option => ({ id: option.id, label: option.label })),
      multiple: false,
    },
  }
}

interface ChoiceRecord extends PersonaAskCardView {
  readonly cardId: string
  readonly createdAt: string
  readonly answer: { readonly optionIds: readonly string[]; readonly text: string; readonly attachmentIds: readonly string[]; readonly answeredAt: string }
}

/** The answers to end-of-turn cards: one per card, the first one stays. */
export class PersonaChoices {
  private readonly screens: ScreenRepos

  /** @param screens - Where the answers are kept. */
  constructor(screens: ScreenRepos) {
    this.screens = screens
  }

  /**
   * @param projectId - Tenant.
   * @param messageId - The persona's message that carries the card.
   * @returns The option already chosen on this card, if any.
   */
  chosen(projectId: string, messageId: string): string | undefined {
    return this.screens.get<ChoiceRecord>(projectId, KIND, messageId)?.answer.optionIds[0]
  }

  /**
   * Remember the tap (call it after the message of the tap is stored).
   * @param projectId - Tenant.
   * @param messageId - The persona's message that carries the card.
   * @param card - The card as the person saw it.
   * @param input - Who offered, which option, when.
   */
  record(projectId: string, messageId: string, card: ChoiceCard, input: { readonly personaId: string; readonly personaName: string; readonly optionId: string; readonly at: string }): void {
    const text = choiceAnswerText(card, input.optionId) ?? ''
    const row: ChoiceRecord = {
      kind: 'fimDoTurno',
      askId: choiceAskId(messageId),
      ticketId: '',
      personaId: input.personaId,
      personaName: input.personaName,
      question: card.question,
      options: card.options.map(option => ({ id: option.id, label: option.label })),
      multiple: false,
      cardId: messageId,
      createdAt: input.at,
      answer: { optionIds: [input.optionId], text, attachmentIds: [], answeredAt: input.at },
    }
    this.screens.put(projectId, KIND, messageId, row)
  }

  /**
   * @param projectId - Tenant.
   * @returns The cards that were answered, as questions answered (the live state the thread reads), oldest first.
   */
  answered(projectId: string): PersonaAskView[] {
    return this.screens.list<ChoiceRecord>(projectId, KIND)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.askId.localeCompare(b.askId))
      .map(row => ({ ...row, status: 'answered' as const }))
  }
}

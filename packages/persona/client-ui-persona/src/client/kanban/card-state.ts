/**
 * Muse + Atlas (12/11): the chip on a card says the state of the CARD, never the persona's own state ("Descansando", "Pausada" and the rest live only on the face and the rail).
 *
 *  - A fazer          : "Na fila de {name}"
 *  - Fazendo          : "{name} está fazendo" (green)
 *  - Revisão interna  : "{name} está revisando" (a colleague is reviewing it now: `card.reviewing`)
 *  - Revisão do cliente (any review stage from outside, nobody on the team reviewing): "Esperando o cliente"
 *  - Feito            : "Feito por {name}" (drawn by the card itself, `card.doneBy`)
 *  - Bloqueado (Muse, 12/11: the column only says it stopped, so the card says WHY): waits for the owner = the AMBER chip "Esperando você" (the only case where amber enters a card);
 *    anything else = the neutral chip "Parado", and the card draws the host's one-line reason under the title when it sent one (`card.blockedReason`).
 *  - No responsible persona: no chip (except in Bloqueado, which has its own). Pure: no I/O.
 */

import type { KanbanCardModel } from './types.ts'

/** The locale key of the sentence (`kanban.*.json`), with `{name}` when the sentence has one. */
export type CardStateKey = 'card.state.todo' | 'card.state.doing' | 'card.state.reviewing' | 'card.state.reviewingTeam' | 'card.state.client' | 'card.state.waitingYou' | 'card.state.stopped'

/** What to draw. */
export interface CardStateChip {
  readonly key: CardStateKey
  readonly tone: 'neutral' | 'success' | 'info' | 'accent'
  /** Whose name fills `{name}`: the card's responsible persona, the reviewer the team context resolved, or nobody (the sentence has no name). */
  readonly who: 'assignee' | 'reviewer' | 'none'
}

/** A review column that is the CLIENT's ("Revisão do cliente", "Client review"). */
const CLIENT_STAGE = /cliente|client/iu

/** What decides whether a stopped card waits for the owner (and not for something else). */
type Waiting = Pick<KanbanCardModel, 'question' | 'deliveryPending' | 'assigneeState'>

/**
 * @param card - The card.
 * @returns Whether it is stopped because the owner has to answer or decide (an open question, a delivery to apply or discard, the persona waiting for her).
 */
export function waitsForOwner(card: Partial<Waiting>): boolean {
  return (card.question !== undefined && card.question.trim() !== '') || card.deliveryPending === true || card.assigneeState === 'waiting'
}

/**
 * Internal review names the REVIEWER, never the author: a card whose reviewer the team context cannot resolve (or who turns out to be its own responsible persona) says "Em revisão", with no name
 * (Ember + Atlas + Muse, 12/11: the fallback must never say the author reviews her own card).
 * @param card - The card (its column, its responsible persona, whether a colleague reviews it and why it stopped).
 * @param reviewerName - The name of the colleague who reviews it now, when the team context resolved one.
 * @param columnName - The name of the flow column the card sits in, when the board knows it. The chip FOLLOWS THE STAGE (Muse, 12/11): a card in an internal review column never says "Esperando o cliente",
 *   even if its own state has no colleague on it; only a column that says "cliente" does.
 * @returns The chip for the card's own state, or `undefined` when the card says nothing about it here (done is drawn separately).
 */
export function cardStateChipOf(card: Pick<KanbanCardModel, 'column'> & Partial<Pick<KanbanCardModel, 'assignee' | 'reviewing'> & Waiting>, reviewerName?: string, columnName?: string): CardStateChip | undefined {
  if (card.column === 'blocked') return waitsForOwner(card) ? { key: 'card.state.waitingYou', tone: 'accent', who: 'none' } : { key: 'card.state.stopped', tone: 'neutral', who: 'none' }
  if (card.assignee === undefined) return undefined
  switch (card.column) {
    case 'todo': return { key: 'card.state.todo', tone: 'neutral', who: 'assignee' }
    case 'in_progress': return { key: 'card.state.doing', tone: 'success', who: 'assignee' }
    case 'in_review': {
      if (card.reviewing === undefined) return columnName !== undefined && !CLIENT_STAGE.test(columnName) ? { key: 'card.state.reviewingTeam', tone: 'info', who: 'none' } : { key: 'card.state.client', tone: 'neutral', who: 'none' }
      const name = reviewerName?.trim() ?? ''
      const author = card.assignee
      const isAuthor = card.reviewing.personaId === author.id || name.toLocaleLowerCase('pt-BR') === author.name.trim().toLocaleLowerCase('pt-BR')
      return name === '' || isAuthor ? { key: 'card.state.reviewingTeam', tone: 'info', who: 'none' } : { key: 'card.state.reviewing', tone: 'info', who: 'reviewer' }
    }
    default: return undefined
  }
}

/**
 * @param card - The card.
 * @returns The one line that says why a stopped card stopped, when the host sent one (a card that is not stopped never shows it); empty otherwise.
 */
export function stoppedReasonOf(card: Pick<KanbanCardModel, 'column'> & { readonly blockedReason?: string | undefined }): string {
  return card.column === 'blocked' ? (card.blockedReason ?? '').trim().slice(0, 140) : ''
}

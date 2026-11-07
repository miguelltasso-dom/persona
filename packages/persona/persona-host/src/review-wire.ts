/**
 * The thread line of a review between colleagues (EQUIPE-REAL, TEAM-6; contracts/review-step.md) lives in the message body: a plain
 * sentence first, the marker last — `[[review:{json}]]`, like `[[handoff:…]]`. The words of the UI are the UI's; this is the fallback
 * sentence of a client that does not know the card. The reviewer's notes are NOT here: they go back to the author as a bilhete.
 */

import type { ReviewCardView } from './types.ts'

const MARKER = /\[\[review:([\s\S]+?)\]\]\s*$/u

/**
 * @param card - The card.
 * @param sentence - The plain sentence shown before the marker.
 * @returns The body to store.
 */
export function reviewBody(card: ReviewCardView, sentence: string): string {
  return `${sentence}\n[[review:${JSON.stringify(card)}]]`
}

/**
 * The sentence an old client shows.
 * @param card - The card.
 * @param names - Display names.
 */
export function reviewSentence(card: ReviewCardView, names: { readonly author: string; readonly reviewer: string }): string {
  if (card.kind === 'reviewed') return card.round > 0 ? `${names.author} ajustou e ${names.reviewer} aprovou` : `${names.reviewer} aprovou o trabalho de ${names.author}`
  const head = `${names.reviewer} pediu ajustes a ${names.author}`
  const detail = card.summary === undefined ? '' : `: ${card.summary}`
  if (card.openPoints !== undefined) return `${names.reviewer} deixou ${String(card.openPoints)} ponto(s) em aberto; o trabalho segue sem o selo${detail}`
  return `${head}${detail}`
}

function text(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/**
 * @param body - Stored message body.
 * @returns The card when the marker is valid, else undefined.
 */
export function reviewFromBody(body: string): ReviewCardView | undefined {
  const raw = MARKER.exec(body)?.[1]?.trim()
  if (raw === undefined || raw === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  const kind = row.kind === 'reviewed' || row.kind === 'returned' ? row.kind : undefined
  const reviewerPersonaId = text(row, 'reviewerPersonaId')
  const authorPersonaId = text(row, 'authorPersonaId')
  const taskId = text(row, 'taskId')
  const round = Number.isInteger(row.round) ? row.round as number : undefined
  const maxRounds = Number.isInteger(row.maxRounds) ? row.maxRounds as number : undefined
  if (kind === undefined || reviewerPersonaId === undefined || authorPersonaId === undefined || taskId === undefined || round === undefined || maxRounds === undefined) return undefined
  const openPoints = Number.isInteger(row.openPoints) ? row.openPoints as number : undefined
  const summary = text(row, 'summary')
  return {
    kind, reviewerPersonaId, authorPersonaId, taskId, round, maxRounds,
    ...(openPoints === undefined ? {} : { openPoints }),
    ...(summary === undefined ? {} : { summary }),
  }
}

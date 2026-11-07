/**
 * Quadros, regra 4 (NEXT-STEP-SHORTCUTS-SPEC §1): "entregas em revisão há mais de 2 dias". Função pura.
 * O tempo vem de `BoardCardView.inReviewSince` (host, aditivo: o instante do último "pronto" do worker, só enquanto a
 * Tarefa espera a revisão da pessoa; devolvida = o relógio reinicia). Cartão sem o campo NÃO entra na contagem:
 * a tela não afirma tempo que não sabe (Keel, 06:07).
 */

export const STALE_REVIEW_DAYS = 2

const DAY_MS = 24 * 60 * 60 * 1000

/** The two fields of a board card that the rule reads (`BoardCardView.category` and `inReviewSince`). */
export interface ReviewCardTime {
  readonly category: string
  readonly inReviewSince?: string | undefined
}

/** How many cards are in review for MORE than 2 days (exactly 2 days does not count). */
export function countStaleReviews(cards: readonly ReviewCardTime[], nowMs: number): number {
  return cards.filter(card => card.category === 'review' && isOlderThanStaleDays(card.inReviewSince, nowMs)).length
}

function isOlderThanStaleDays(since: string | undefined, nowMs: number): boolean {
  if (since === undefined) return false
  const sinceMs = Date.parse(since)
  return Number.isFinite(sinceMs) && nowMs - sinceMs > STALE_REVIEW_DAYS * DAY_MS
}

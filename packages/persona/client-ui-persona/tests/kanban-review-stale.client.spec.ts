// Quadros, regra 4 (NEXT-STEP-SHORTCUTS-SPEC §1; Keel 06:07): só cartões em revisão há MAIS de 2 dias, pelo
// BoardCardView.inReviewSince. Cartão sem data não entra: a tela não afirma tempo que não sabe.
import { describe, expect, it } from 'vitest'
import { countStaleReviews } from '../src/client/kanban/review-stale.ts'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const daysAgo = (days: number): string => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString()

describe('countStaleReviews (Quadros, regra 4)', () => {
  it('conta só os cartões em revisão há mais de 2 dias', () => {
    const cards = [
      { category: 'review', inReviewSince: daysAgo(3) },
      { category: 'review', inReviewSince: daysAgo(1) },
      { category: 'review', inReviewSince: daysAgo(10) },
      { category: 'doing', inReviewSince: daysAgo(9) },
      { category: 'done', inReviewSince: daysAgo(9) },
    ]
    expect(countStaleReviews(cards, NOW)).toBe(2)
  })

  it('exatamente 2 dias ainda não conta; cartão sem data e data ilegível não entram', () => {
    expect(countStaleReviews([
      { category: 'review', inReviewSince: daysAgo(2) },
      { category: 'review' },
      { category: 'review', inReviewSince: 'não é data' },
    ], NOW)).toBe(0)
  })
})

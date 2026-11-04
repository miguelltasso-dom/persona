/**
 * Variable-layer budget by relevance (TOKEN-OPTIMIZATION §2.3 / OPT-4).
 * A head clip keeps whatever came first; after `compileContext` that is id order,
 * not relevance, so a broad question loses the note that answers it. Ranking the
 * rows by overlap with the question BEFORE the budget keeps the evidence.
 */

import { estimateTokens } from '@deepseek-ai/dsh-persona-core'

/** Function words that carry no retrieval signal (pt-BR, plus the "nota" row label). */
const STOP = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'que', 'em', 'um', 'uma', 'para', 'com',
  'no', 'na', 'nos', 'nas', 'por', 'se', 'nota', 'qual', 'como', 'esta', 'esse', 'essa', 'foi', 'ser',
])

function wordsOf(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(word => word.length > 2 && !STOP.has(word))
}

/**
 * Count of distinct meaningful words the row shares with the question.
 * @param row - One recall row.
 * @param query - The person's line of this turn.
 * @returns 0 when nothing overlaps.
 */
export function relevanceOverlap(row: string, query: string): number {
  const wanted = new Set(wordsOf(query))
  let score = 0
  for (const word of new Set(wordsOf(row))) if (wanted.has(word)) score += 1
  return score
}

/**
 * Most relevant first; equal scores keep their original order (stable).
 * @param rows - Rows in retrieval order.
 * @param query - The person's line of this turn.
 * @returns A new array; nothing is dropped.
 */
export function rankRowsByRelevance(rows: readonly string[], query: string): string[] {
  return rows
    .map((row, index) => ({ row, index, score: relevanceOverlap(row, query) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(item => item.row)
}

/**
 * Fit rows to a token budget, relevance first. Rows with no overlap are kept only
 * while budget remains after the relevant ones; a row that does not fit is skipped
 * (smaller rows behind it may still fit).
 * @param rows - Rows in retrieval order.
 * @param query - The person's line of this turn.
 * @param budgetTokens - Ceiling for the joined text (one token of newline per row).
 * @returns Joined text, never above the budget.
 */
export function fitRowsToBudget(rows: readonly string[], query: string, budgetTokens: number): string {
  const kept: string[] = []
  let used = 0
  for (const row of rankRowsByRelevance(rows, query)) {
    const cost = estimateTokens(row) + 1
    if (used + cost > budgetTokens) continue
    kept.push(row)
    used += cost
  }
  return kept.join('\n')
}

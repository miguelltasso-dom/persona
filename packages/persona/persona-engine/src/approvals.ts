/**
 * Structured approval card (PRO-5 / PROACTIVITY.md §4). One question, one primary action.
 */

export interface ApprovalCard {
  question: string
  primary: { label: string; action: 'approve' | 'reject' | 'run' }
  impact: string
  cost: { tokens?: number; runs?: number; summary: string }
  persona_id: string
  ticket_id?: string
}

/**
 * @param card - Already-translated pt-BR copy from the host.
 */
export function approvalCard(card: ApprovalCard): ApprovalCard {
  return { ...card }
}

/**
 * Milestone digest for the coordination reply (C2). ≤100 words when used in chat.
 * @param titles - Ended ticket titles, newest first.
 */
export function milestoneSummary(titles: readonly string[]): string {
  if (titles.length === 0) return ''
  const head = titles.slice(0, 5)
  const more = titles.length > 5 ? ` e mais ${titles.length - 5}` : ''
  return `Concluído: ${head.join('; ')}${more}.`
}
